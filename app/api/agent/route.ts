import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { researchDomainAndGeneratePrompts } from "@/lib/parallel";
import { adminDb } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { logError, logInfo } from "@/lib/log";

const MAX_GENERATED_PROMPTS = 5;
const INITIAL_GENERATION_STATUS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

function normalizePromptText(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").toLowerCase();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

async function updateInitialGenerationState(
  siteId: string,
  userId: string,
  status: string,
  errorMessage: string | null
) {
  await adminDb
    .from("sites")
    .update({
      initial_prompt_generation_status: status,
      initial_prompt_generation_error: errorMessage,
    })
    .eq("id", siteId)
    .eq("user_id", userId);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domain, siteId, mode } = await req.json();
  if (!domain || !siteId) {
    return NextResponse.json({ error: "domain and siteId required" }, { status: 400 });
  }
  const generationMode = mode === "initial" ? "initial" : "additional";

  logInfo("onboarding", "Starting prompt generation", {
    domain,
    siteId,
    mode: generationMode,
    userId: session.user.id,
    userEmail: session.user.email,
  });

  // Verify site belongs to user
  const { data: site, error: siteError } = await adminDb
    .from("sites")
    .select("id, initial_prompt_generation_status")
    .eq("id", siteId)
    .eq("user_id", session.user.id)
    .single();

  if (siteError || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  let claimedInitialGeneration = false;

  if (generationMode === "initial") {
    if (
      site.initial_prompt_generation_status === INITIAL_GENERATION_STATUS.IN_PROGRESS ||
      site.initial_prompt_generation_status === INITIAL_GENERATION_STATUS.COMPLETED
    ) {
      logInfo("onboarding", "Skipped duplicate initial prompt generation", {
        domain,
        siteId,
        status: site.initial_prompt_generation_status,
        userId: session.user.id,
        userEmail: session.user.email,
      });
      return NextResponse.json({
        skipped: true,
        reason: "initial_generation_already_started",
      });
    }

    const { data: claimedSite, error: claimError } = await adminDb
      .from("sites")
      .update({
        initial_prompt_generation_status: INITIAL_GENERATION_STATUS.IN_PROGRESS,
        initial_prompt_generation_error: null,
      })
      .eq("id", siteId)
      .eq("user_id", session.user.id)
      .in("initial_prompt_generation_status", [
        INITIAL_GENERATION_STATUS.NOT_STARTED,
        INITIAL_GENERATION_STATUS.FAILED,
      ])
      .select("id")
      .maybeSingle();

    if (claimError) {
      logError("onboarding", "Failed to claim initial prompt generation", {
        domain,
        siteId,
        error: claimError,
        userId: session.user.id,
        userEmail: session.user.email,
      });
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    if (!claimedSite) {
      logInfo("onboarding", "Skipped already-claimed initial prompt generation", {
        domain,
        siteId,
        userId: session.user.id,
        userEmail: session.user.email,
      });
      return NextResponse.json({
        skipped: true,
        reason: "initial_generation_already_started",
      });
    }

    claimedInitialGeneration = true;
  }

  try {
    // Run research agent
    const research = await researchDomainAndGeneratePrompts(domain);
    const generatedPrompts = Array.isArray(research.prompts)
      ? [...new Set(
          research.prompts
            .filter((prompt): prompt is string => typeof prompt === "string")
            .map((prompt) => prompt.trim())
            .filter(Boolean)
        )].slice(0, MAX_GENERATED_PROMPTS)
      : [];

    if (generatedPrompts.length === 0) {
      logError("onboarding", "Research returned no usable prompts", {
        domain,
        siteId,
        mode: generationMode,
        research,
      });
      if (claimedInitialGeneration) {
        await updateInitialGenerationState(
          siteId,
          session.user.id,
          INITIAL_GENERATION_STATUS.FAILED,
          "Failed to generate prompts."
        );
      }
      return NextResponse.json({ error: "Failed to generate prompts" }, { status: 500 });
    }

    logInfo("onboarding", "Prompt generation finished", {
      domain,
      siteId,
      mode: generationMode,
      promptCount: generatedPrompts.length,
      niche: research.niche,
      targetAudience: research.targetAudience,
    });

    const { data: existingPrompts, error: existingPromptsError } = await adminDb
      .from("prompts")
      .select("text")
      .eq("site_id", siteId);

    if (existingPromptsError) {
      logError("onboarding", "Failed to load existing prompts", {
        domain,
        siteId,
        mode: generationMode,
        error: existingPromptsError,
      });
      if (claimedInitialGeneration) {
        await updateInitialGenerationState(
          siteId,
          session.user.id,
          INITIAL_GENERATION_STATUS.FAILED,
          existingPromptsError.message
        );
      }
      return NextResponse.json({ error: existingPromptsError.message }, { status: 500 });
    }

    const existingPromptTexts = new Set(
      (existingPrompts ?? []).map(({ text }) => normalizePromptText(text))
    );
    const promptsToInsert = generatedPrompts.filter(
      (text) => !existingPromptTexts.has(normalizePromptText(text))
    );

    if (promptsToInsert.length === 0) {
      if (claimedInitialGeneration) {
        await updateInitialGenerationState(
          siteId,
          session.user.id,
          INITIAL_GENERATION_STATUS.COMPLETED,
          null
        );
      }

      logInfo("onboarding", "Skipped prompt insert because all prompts already exist", {
        domain,
        siteId,
        mode: generationMode,
        userId: session.user.id,
        userEmail: session.user.email,
      });

      return NextResponse.json({
        skipped: true,
        reason: "prompts_already_exist",
        targetAudience: research.targetAudience,
        niche: research.niche,
        prompts: [],
      });
    }

    // Persist generated prompts
    const { data: prompts, error: insertError } = await adminDb
      .from("prompts")
      .insert(promptsToInsert.map((text) => ({ site_id: siteId, text })))
      .select("id, text");

    if (insertError) {
      logError("onboarding", "Failed to persist generated prompts", {
        domain,
        siteId,
        mode: generationMode,
        error: insertError,
      });
      if (claimedInitialGeneration) {
        await updateInitialGenerationState(
          siteId,
          session.user.id,
          INITIAL_GENERATION_STATUS.FAILED,
          insertError.message
        );
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (claimedInitialGeneration) {
      const { error: completeError } = await adminDb
        .from("sites")
        .update({
          initial_prompt_generation_status: INITIAL_GENERATION_STATUS.COMPLETED,
          initial_prompt_generation_error: null,
        })
        .eq("id", siteId)
        .eq("user_id", session.user.id);

      if (completeError) {
        logError("onboarding", "Failed to mark initial prompt generation complete", {
          domain,
          siteId,
          error: completeError,
          userId: session.user.id,
          userEmail: session.user.email,
        });
        await updateInitialGenerationState(
          siteId,
          session.user.id,
          INITIAL_GENERATION_STATUS.FAILED,
          completeError.message
        );
        return NextResponse.json({ error: completeError.message }, { status: 500 });
      }
    }

    // Kick off prompt testing via Inngest
    try {
      const eventResult = await inngest.send({
        name: "site/check",
        data: {
          siteId,
          domain,
          userEmail: session.user.email,
        },
      });

      logInfo("onboarding", "Queued site/check event after prompt generation", {
        domain,
        siteId,
        mode: generationMode,
        eventIds: eventResult.ids,
        userEmail: session.user.email,
      });
    } catch (error) {
      logError("onboarding", "Failed to queue site/check event after prompt generation", {
        domain,
        siteId,
        mode: generationMode,
        userEmail: session.user.email,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      const message = getErrorMessage(error);
      if (claimedInitialGeneration) {
        await updateInitialGenerationState(
          siteId,
          session.user.id,
          INITIAL_GENERATION_STATUS.FAILED,
          message
        );
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({
      targetAudience: research.targetAudience,
      niche: research.niche,
      prompts,
    });
  } catch (error) {
    if (claimedInitialGeneration) {
      await updateInitialGenerationState(
        siteId,
        session.user.id,
        INITIAL_GENERATION_STATUS.FAILED,
        getErrorMessage(error)
      );
    }

    const message = getErrorMessage(error);
    logError("onboarding", "Prompt generation failed unexpectedly", {
      domain,
      siteId,
      mode: generationMode,
      userId: session.user.id,
      userEmail: session.user.email,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
