import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { researchDomainAndGeneratePrompts } from "@/lib/parallel";
import { adminDb } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { logError, logInfo } from "@/lib/log";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domain, siteId } = await req.json();
  if (!domain || !siteId) {
    return NextResponse.json({ error: "domain and siteId required" }, { status: 400 });
  }

  logInfo("onboarding", "Starting prompt generation", {
    domain,
    siteId,
    userId: session.user.id,
    userEmail: session.user.email,
  });

  // Verify site belongs to user
  const { data: site, error: siteError } = await adminDb
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", session.user.id)
    .single();

  if (siteError || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Run research agent
  const research = await researchDomainAndGeneratePrompts(domain);
  const generatedPrompts = Array.isArray(research.prompts)
    ? research.prompts.filter((prompt): prompt is string => typeof prompt === "string" && prompt.trim().length > 0)
    : [];

  if (generatedPrompts.length === 0) {
    logError("onboarding", "Research returned no usable prompts", {
      domain,
      siteId,
      research,
    });
    return NextResponse.json({ error: "Failed to generate prompts" }, { status: 500 });
  }

  logInfo("onboarding", "Prompt generation finished", {
    domain,
    siteId,
    promptCount: generatedPrompts.length,
    niche: research.niche,
    targetAudience: research.targetAudience,
  });

  // Persist generated prompts
  const { data: prompts, error: insertError } = await adminDb
    .from("prompts")
    .insert(generatedPrompts.map((text) => ({ site_id: siteId, text })))
    .select("id, text");

  if (insertError) {
    logError("onboarding", "Failed to persist generated prompts", {
      domain,
      siteId,
      error: insertError,
    });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
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

    logInfo("onboarding", "Queued initial site/check event", {
      domain,
      siteId,
      eventIds: eventResult.ids,
      userEmail: session.user.email,
    });
  } catch (error) {
    logError("onboarding", "Failed to queue initial site/check event", {
      domain,
      siteId,
      userEmail: session.user.email,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    throw error;
  }

  return NextResponse.json({
    targetAudience: research.targetAudience,
    niche: research.niche,
    prompts,
  });
}
