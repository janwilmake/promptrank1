"use client";

import Image from "next/image";
import {
  extractDomainsFromText,
  extractUrlsFromText,
  getDomainForUrl,
  isLikelyProviderError,
  normalizeComparableDomain,
} from "@/lib/competitors";
import type { Prompt } from "@/components/dashboard/prompts-table";

interface Props {
  prompts: Prompt[];
  domain: string;
  loading?: boolean;
}

type RankingWebsiteSummary = {
  domain: string;
  mentions: number;
  pages: string[];
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

function buildRankingWebsiteOverview(prompts: Prompt[], domain: string) {
  const siteDomain = normalizeComparableDomain(domain);
  const summaryMap = new Map<string, RankingWebsiteSummary>();

  for (const prompt of prompts) {
    for (const result of latestResults(prompt.prompt_results)) {
      if (!result.response || isLikelyProviderError(result.response)) continue;

      const websites = extractDomainsFromText(result.response, [siteDomain]);
      const urls = extractUrlsFromText(result.response);

      for (const website of websites) {
        const summary = summaryMap.get(website) ?? {
          domain: website,
          mentions: 0,
          pages: [],
          providers: [],
        };

        summary.mentions += 1;

        if (!summary.providers.includes(result.provider)) {
          summary.providers.push(result.provider);
        }

        for (const url of urls) {
          if (getDomainForUrl(url) !== website) continue;
          if (!summary.pages.includes(url)) {
            summary.pages.push(url);
          }
        }

        summaryMap.set(website, summary);
      }
    }
  }

  return Array.from(summaryMap.values())
    .sort((a, b) => b.mentions - a.mentions || a.domain.localeCompare(b.domain))
    .slice(0, 12);
}

export function RankingWebsitesOverview({ prompts, domain, loading = false }: Props) {
  const rankingWebsites = buildRankingWebsiteOverview(prompts, domain);

  if (loading) {
    return <div className="text-sm text-neutral-500">Loading ranking websites…</div>;
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Ranking Websites
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Websites that appeared in provider responses for your tracked prompts, including blogs and informational pages.
          </p>
        </div>
        <div className="text-xs text-neutral-400">{rankingWebsites.length} shown</div>
      </div>

      {rankingWebsites.length === 0 ? (
        <p className="mt-5 text-sm text-neutral-500">
          No ranking websites have been extracted from the stored provider responses yet.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {rankingWebsites.map((website) => (
            <article
              key={website.domain}
              className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
            >
              <div className="flex items-center gap-3">
                <Image
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(website.domain)}&sz=32`}
                  alt=""
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] rounded-sm"
                  unoptimized
                />
                <div className="min-w-0">
                  <div className="truncate font-medium text-neutral-900">{website.domain}</div>
                  <div className="text-xs text-neutral-500">
                    Seen in {website.mentions} provider response
                    {website.mentions === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {website.providers.map((provider) => (
                  <span
                    key={provider}
                    className="rounded-full bg-white px-2 py-1 text-[11px] text-neutral-500"
                  >
                    {provider}
                  </span>
                ))}
              </div>

              {website.pages.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {website.pages.slice(0, 6).map((page) => (
                    <a
                      key={page}
                      href={page}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 transition-colors hover:border-neutral-300 hover:text-neutral-900"
                      title={page}
                    >
                      {page}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs text-neutral-500">
                  No direct webpage URLs were detected for this website.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
