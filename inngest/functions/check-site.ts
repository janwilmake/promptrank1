import { inngest } from "../client";
import { adminDb } from "@/lib/db";
import { testPromptAllProviders } from "@/lib/openrouter";
import { sendResultsEmail } from "@/lib/email";

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
  async ({ event, step }) => {
    const { siteId, domain, userEmail } = event.data as CheckSiteData;

    const prompts = await step.run("fetch-prompts", async () => {
      const { data, error } = await adminDb
        .from("prompts")
        .select("id, text")
        .eq("site_id", siteId);

      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (prompts.length === 0) return { skipped: true, reason: "no prompts" };

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
            })),
          };
        })
      );
      return results;
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

    return { siteId, promptsChecked: prompts.length };
  }
);

// Hourly cron: enqueue sites that haven't been checked in 7+ days (paid users only)
export const weeklyCronJob = inngest.createFunction(
  {
    id: "weekly-check-cron",
    name: "Weekly Prompt Check Cron",
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
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

    if (sites.length === 0) return { enqueued: 0 };

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

    return { enqueued: sites.length };
  }
);
