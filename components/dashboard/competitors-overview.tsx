"use client";

import Image from "next/image";
import type { Prompt } from "@/components/dashboard/prompts-table";

interface Props {
  prompts: Prompt[];
  loading?: boolean;
}

type CompetitorSummary = {
  domain: string;
  mentions: number;
  providers: string[];
};

function latestResults(results: Prompt["prompt_results"]) {
  const map: Record<string, Prompt["prompt_results"][number]> = {};
  for (const result of results) {
    if (!map[result.provider] || result.checked_at > map[result.provider].checked_at) {
      map[result.provider] = result;
    }
  }
  return Object.values(map);
}

function buildCompetitorOverview(prompts: Prompt[]) {
  const summaryMap = new Map<string, CompetitorSummary>();

  for (const prompt of prompts) {
    for (const result of latestResults(prompt.prompt_results)) {
      for (const competitor of result.competitor_domains ?? []) {
        const summary = summaryMap.get(competitor) ?? {
          domain: competitor,
          mentions: 0,
          providers: [],
        };

        summary.mentions += 1;

        if (!summary.providers.includes(result.provider)) {
          summary.providers.push(result.provider);
        }

        summaryMap.set(competitor, summary);
      }
    }
  }

  return Array.from(summaryMap.values()).sort(
    (a, b) => b.mentions - a.mentions || a.domain.localeCompare(b.domain)
  );
}

export function CompetitorsOverview({ prompts, loading = false }: Props) {
  const competitors = buildCompetitorOverview(prompts);

  if (loading) {
    return <div className="text-sm text-neutral-500">Loading competitors…</div>;
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Competitors
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Domains classified as actual competitors rather than general ranking websites.
          </p>
        </div>
        <div className="text-xs text-neutral-400">{competitors.length} shown</div>
      </div>

      {competitors.length === 0 ? (
        <p className="mt-5 text-sm text-neutral-500">
          No actual competitors have been classified from the stored provider responses yet.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {competitors.slice(0, 12).map((competitor) => (
            <article
              key={competitor.domain}
              className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
            >
              <div className="flex items-center gap-3">
                <Image
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(competitor.domain)}&sz=32`}
                  alt=""
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] rounded-sm"
                  unoptimized
                />
                <div className="min-w-0">
                  <div className="truncate font-medium text-neutral-900">{competitor.domain}</div>
                  <div className="text-xs text-neutral-500">
                    Classified as a competitor in {competitor.mentions} provider result
                    {competitor.mentions === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {competitor.providers.map((provider) => (
                  <span
                    key={provider}
                    className="rounded-full bg-white px-2 py-1 text-[11px] text-neutral-500"
                  >
                    {provider}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
