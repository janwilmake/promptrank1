import { inngest } from "../client";
import { adminDb } from "@/lib/db";
import { sendResultsEmail, type PromptResultSummary } from "@/lib/email";
import { testPromptAllProviders } from "@/lib/openrouter";
import { logError, logInfo } from "@/lib/log";

type SiteCheckData = {
  siteId: string;
  domain: string;
  userEmail: string;
  promptIds?: string[];
};

type PromptCheckData = {
  siteId: string;
  domain: string;
  userEmail: string;
  promptId: string;
  promptText: string;
  checkRunId: string;
};

type FinalizeSiteCheckData = {
  checkRunId: string;
};

type SitePrompt = {
  id: string;
  text: string;
};

async function buildRunSummaries(checkRunId: string): Promise<PromptResultSummary[]> {
  const { data: runPrompts, error: runPromptsError } = await adminDb
    .from("site_check_run_prompts")
    .select("prompt_id, prompt_text")
    .eq("site_check_run_id", checkRunId)
    .order("created_at", { ascending: true });

  if (runPromptsError) {
    throw new Error(runPromptsError.message);
  }

  const { data: results, error: resultsError } = await adminDb
    .from("prompt_results")
    .select("prompt_id, provider, mentions_domain, rank")
    .eq("check_run_id", checkRunId)
    .order("checked_at", { ascending: true });

  if (resultsError) {
    throw new Error(resultsError.message);
  }

  const resultsByPrompt = new Map<
    string,
    PromptResultSummary["results"]
  >();

  for (const result of results ?? []) {
    const promptResults = resultsByPrompt.get(result.prompt_id) ?? [];
    promptResults.push({
      provider: result.provider,
      mentions_domain: result.mentions_domain,
      rank: result.rank,
    });
    resultsByPrompt.set(result.prompt_id, promptResults);
  }

  return (runPrompts ?? []).map((prompt) => ({
    prompt: prompt.prompt_text,
    results: resultsByPrompt.get(prompt.prompt_id) ?? [],
  }));
}

export const checkSite = inngest.createFunction(
  {
    id: "check-site",
    name: "Check Site Prompts",
    concurrency: { limit: 10 },
    retries: 2,
    triggers: [{ event: "site/check" as const }],
  },
  async ({ event, step, runId, attempt }) => {
    const { siteId, domain, userEmail, promptIds } = event.data as SiteCheckData;

    try {
      logInfo("inngest", "check-site started", {
        runId,
        attempt,
        eventId: event.id,
        siteId,
        domain,
        userEmail,
        promptIds,
      });

      const prompts = await step.run("fetch-prompts", async () => {
        let query = adminDb.from("prompts").select("id, text").eq("site_id", siteId);

        if (promptIds && promptIds.length > 0) {
          query = query.in("id", promptIds);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);
        return (data ?? []) as SitePrompt[];
      });

      logInfo("inngest", "Fetched prompts for check-site", {
        runId,
        siteId,
        domain,
        promptCount: prompts.length,
      });

      if (prompts.length === 0) {
        logInfo("inngest", "check-site skipped because no prompts exist", {
          runId,
          siteId,
          domain,
        });
        return { skipped: true, reason: "no prompts" };
      }

      const checkRunId = await step.run("create-site-check-run", async () => {
        const { data: run, error: runError } = await adminDb
          .from("site_check_runs")
          .insert({
            site_id: siteId,
            domain,
            user_email: userEmail,
            total_prompts: prompts.length,
          })
          .select("id")
          .single();

        if (runError) throw new Error(runError.message);

        const { error: promptError } = await adminDb.from("site_check_run_prompts").insert(
          prompts.map((prompt) => ({
            site_check_run_id: run.id,
            prompt_id: prompt.id,
            prompt_text: prompt.text,
          }))
        );

        if (promptError) throw new Error(promptError.message);

        return run.id;
      });

      await step.sendEvent(
        "enqueue-prompts",
        prompts.map((prompt) => ({
          name: "prompt/check" as const,
          data: {
            siteId,
            domain,
            userEmail,
            promptId: prompt.id,
            promptText: prompt.text,
            checkRunId,
          } satisfies PromptCheckData,
        }))
      );

      logInfo("inngest", "check-site enqueued prompt jobs", {
        runId,
        siteId,
        domain,
        checkRunId,
        promptCount: prompts.length,
      });

      return { siteId, checkRunId, promptsQueued: prompts.length };
    } catch (error) {
      logError("inngest", "check-site failed", {
        runId,
        siteId,
        domain,
        attempt,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }
);

export const checkPrompt = inngest.createFunction(
  {
    id: "check-prompt",
    name: "Check Single Prompt",
    concurrency: { limit: 50 },
    retries: 2,
    triggers: [{ event: "prompt/check" as const }],
  },
  async ({ event, step, runId, attempt }) => {
    const { siteId, domain, promptId, promptText, checkRunId } = event.data as PromptCheckData;

    try {
      logInfo("inngest", "check-prompt started", {
        runId,
        attempt,
        eventId: event.id,
        siteId,
        domain,
        promptId,
        checkRunId,
      });

      const providerResults = await step.run("test-prompt-all-providers", async () => {
        return testPromptAllProviders(promptText, domain);
      });

      await step.run("store-prompt-results", async () => {
        const checkedAt = new Date().toISOString();
        const { error } = await adminDb.from("prompt_results").upsert(
          providerResults.map((result) => ({
            prompt_id: promptId,
            check_run_id: checkRunId,
            provider: result.provider,
            response: result.response,
            mentions_domain: result.mentions_domain,
            rank: result.rank,
            competitor_domains: result.competitor_domains,
            checked_at: checkedAt,
          })),
          { onConflict: "prompt_id,provider,check_run_id" }
        );

        if (error) throw new Error(error.message);
      });

      const markedComplete = await step.run("mark-prompt-complete", async () => {
        const { data, error } = await adminDb
          .from("site_check_run_prompts")
          .update({ completed_at: new Date().toISOString() })
          .eq("site_check_run_id", checkRunId)
          .eq("prompt_id", promptId)
          .is("completed_at", null)
          .select("prompt_id")
          .maybeSingle();

        if (error) throw new Error(error.message);
        return Boolean(data);
      });

      if (markedComplete) {
        await step.sendEvent("finalize-site-check", {
          name: "site/check.finalize" as const,
          data: {
            checkRunId,
          } satisfies FinalizeSiteCheckData,
        });
      }

      logInfo("inngest", "check-prompt finished", {
        runId,
        siteId,
        domain,
        promptId,
        checkRunId,
        providerResultCount: providerResults.length,
        markedComplete,
      });

      return { promptId, checkRunId, providerResultCount: providerResults.length };
    } catch (error) {
      logError("inngest", "check-prompt failed", {
        runId,
        siteId,
        domain,
        promptId,
        checkRunId,
        attempt,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }
);

export const finalizeSiteCheck = inngest.createFunction(
  {
    id: "finalize-site-check",
    name: "Finalize Site Check",
    concurrency: { limit: 20 },
    retries: 2,
    triggers: [{ event: "site/check.finalize" as const }],
  },
  async ({ event, step, runId, attempt }) => {
    const { checkRunId } = event.data as FinalizeSiteCheckData;

    try {
      logInfo("inngest", "finalize-site-check started", {
        runId,
        attempt,
        eventId: event.id,
        checkRunId,
      });

      const run = await step.run("load-site-check-run", async () => {
        const { data, error } = await adminDb
          .from("site_check_runs")
          .select("id, site_id, domain, user_email, total_prompts, finished_at, email_sent_at")
          .eq("id", checkRunId)
          .single();

        if (error) throw new Error(error.message);
        return data;
      });

      if (run.finished_at) {
        logInfo("inngest", "finalize-site-check skipped because run already finished", {
          runId,
          checkRunId,
          finishedAt: run.finished_at,
        });
        return { finalized: false, reason: "already-finished" };
      }

      const incompletePromptCount = await step.run("count-incomplete-prompts", async () => {
        const { count, error } = await adminDb
          .from("site_check_run_prompts")
          .select("*", { count: "exact", head: true })
          .eq("site_check_run_id", checkRunId)
          .is("completed_at", null);

        if (error) throw new Error(error.message);
        return count ?? 0;
      });

      if (incompletePromptCount > 0) {
        logInfo("inngest", "finalize-site-check waiting for remaining prompts", {
          runId,
          checkRunId,
          incompletePromptCount,
        });
        return { finalized: false, reason: "prompts-pending", incompletePromptCount };
      }

      const claimedRun = await step.run("mark-run-finished", async () => {
        const { data, error } = await adminDb
          .from("site_check_runs")
          .update({ finished_at: new Date().toISOString() })
          .eq("id", checkRunId)
          .is("finished_at", null)
          .select("id, site_id, domain, user_email, total_prompts, email_sent_at")
          .maybeSingle();

        if (error) throw new Error(error.message);
        return data;
      });

      if (!claimedRun) {
        logInfo("inngest", "finalize-site-check lost finish claim", {
          runId,
          checkRunId,
        });
        return { finalized: false, reason: "finish-claim-lost" };
      }

      const summaries = await step.run("build-run-summaries", async () => {
        return buildRunSummaries(checkRunId);
      });

      await step.run("update-site-last-checked", async () => {
        const { error } = await adminDb
          .from("sites")
          .update({ last_checked: new Date().toISOString() })
          .eq("id", claimedRun.site_id);

        if (error) throw new Error(error.message);
      });

      const emailed = await step.run("send-results-email", async () => {
        try {
          await sendResultsEmail(claimedRun.user_email, claimedRun.domain, summaries);

          const { error } = await adminDb
            .from("site_check_runs")
            .update({ email_sent_at: new Date().toISOString() })
            .eq("id", checkRunId);

          if (error) throw new Error(error.message);

          return true;
        } catch (error) {
          logError("inngest", "finalize-site-check email failed", {
            runId,
            checkRunId,
            siteId: claimedRun.site_id,
            domain: claimedRun.domain,
            error: error instanceof Error ? error : new Error(String(error)),
          });
          return false;
        }
      });

      logInfo("inngest", "finalize-site-check finished", {
        runId,
        checkRunId,
        siteId: claimedRun.site_id,
        domain: claimedRun.domain,
        totalPrompts: claimedRun.total_prompts,
        emailed,
      });

      return {
        finalized: true,
        checkRunId,
        siteId: claimedRun.site_id,
        totalPrompts: claimedRun.total_prompts,
        emailed,
      };
    } catch (error) {
      logError("inngest", "finalize-site-check failed", {
        runId,
        checkRunId,
        attempt,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }
);

export const weeklyCronJob = inngest.createFunction(
  {
    id: "weekly-check-cron",
    name: "Weekly Prompt Check Cron",
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step, runId, attempt }) => {
    try {
      logInfo("inngest", "weekly-check-cron started", {
        runId,
        attempt,
      });

      const sites = await step.run("find-stale-sites", async () => {
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        const { data, error } = await adminDb.rpc("get_stale_paid_sites", {
          cutoff: sevenDaysAgo,
        });

        if (error) throw new Error(error.message);
        return (data ?? []) as { site_id: string; domain: string; email: string }[];
      });

      if (sites.length === 0) {
        logInfo("inngest", "weekly-check-cron found no stale sites", {
          runId,
        });
        return { enqueued: 0 };
      }

      await step.sendEvent(
        "enqueue-sites",
        sites.map((site) => ({
          name: "site/check" as const,
          data: {
            siteId: site.site_id,
            domain: site.domain,
            userEmail: site.email,
          } satisfies SiteCheckData,
        }))
      );

      logInfo("inngest", "weekly-check-cron enqueued stale sites", {
        runId,
        siteCount: sites.length,
        siteIds: sites.map((site) => site.site_id),
      });

      return { enqueued: sites.length };
    } catch (error) {
      logError("inngest", "weekly-check-cron failed", {
        runId,
        attempt,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }
);
