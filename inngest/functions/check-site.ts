import { inngest } from "../client";
import { adminDb } from "@/lib/db";
import { testPromptAllProviders } from "@/lib/openrouter";
import { sendResultsEmail } from "@/lib/email";
import { logError, logInfo } from "@/lib/log";

type CheckSiteData = {
  siteId: string;
  domain: string;
  userEmail: string;
};

// Processes all prompts for a single site across all LLM providers
export const checkSite = inngest.createFunction(
  {
    id: "check-site",
    name: "Check Site Prompts",
    concurrency: { limit: 10 },
    retries: 2,
    triggers: [{ event: "site/check" as const }],
  },
  async ({ event, step, runId, attempt }) => {
    const { siteId, domain, userEmail } = event.data as CheckSiteData;

    try {
      logInfo("inngest", "check-site started", {
        runId,
        attempt,
        eventId: event.id,
        siteId,
        domain,
        userEmail,
      });

      const prompts = await step.run("fetch-prompts", async () => {
        const { data, error } = await adminDb
          .from("prompts")
          .select("id, text")
          .eq("site_id", siteId);

        if (error) throw new Error(error.message);
        return data ?? [];
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

      const allSummaries = await step.run("test-all-prompts", async () => {
        const results = await Promise.all(
          prompts.map(async (prompt: { id: string; text: string }) => {
            const providerResults = await testPromptAllProviders(prompt.text, domain);

            if (providerResults.length > 0) {
              await adminDb.from("prompt_results").insert(
                providerResults.map((r) => ({
                  prompt_id: prompt.id,
                provider: r.provider,
                response: r.response,
                mentions_domain: r.mentions_domain,
                rank: r.rank,
                competitor_domains: r.competitor_domains,
                checked_at: new Date().toISOString(),
              }))
            );
            }

            return {
              prompt: prompt.text,
              results: providerResults.map((r) => ({
              provider: r.provider,
              mentions_domain: r.mentions_domain,
              rank: r.rank,
              competitor_domains: r.competitor_domains,
            })),
          };
        })
        );
        return results;
      });

      logInfo("inngest", "Completed provider checks for site", {
        runId,
        siteId,
        domain,
        promptCount: prompts.length,
        providerResultCount: allSummaries.reduce((count, summary) => count + summary.results.length, 0),
      });

      await step.run("update-last-checked", async () => {
        await adminDb
          .from("sites")
          .update({ last_checked: new Date().toISOString() })
          .eq("id", siteId);
      });

      await step.run("send-email", async () => {
        await sendResultsEmail(userEmail, domain, allSummaries);
      });

      logInfo("inngest", "check-site finished", {
        runId,
        siteId,
        domain,
        promptCount: prompts.length,
        emailed: true,
      });

      return { siteId, promptsChecked: prompts.length };
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

// Hourly cron: enqueue sites that haven't been checked in 7+ days (paid users only)
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
        sites.map((s: { site_id: string; domain: string; email: string }) => ({
          name: "site/check" as const,
          data: {
            siteId: s.site_id,
            domain: s.domain,
            userEmail: s.email,
          } satisfies CheckSiteData,
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
