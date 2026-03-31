"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  extractDomainsFromText,
  isLikelyProviderError,
  normalizeComparableDomain,
} from "@/lib/competitors";
import { PROVIDERS } from "@/lib/openrouter";

export interface PromptResult {
  id: string;
  provider: string;
  response: string;
  mentions_domain: boolean;
  rank: number | null;
  competitor_domains: string[];
  checked_at: string;
}

export interface Prompt {
  id: string;
  text: string;
  created_at: string;
  prompt_results: PromptResult[];
}

interface Props {
  siteId: string;
  prompts: Prompt[];
  domain: string;
  loading?: boolean;
  onPromptDeleted?: (promptId: string) => void;
}

// Get the latest result per provider for a prompt
function latestResults(results: PromptResult[]): Record<string, PromptResult> {
  const map: Record<string, PromptResult> = {};
  for (const r of results) {
    if (!map[r.provider] || r.checked_at > map[r.provider].checked_at) {
      map[r.provider] = r;
    }
  }
  return map;
}

function getProviderError(response: string) {
  return response.replace(/^\[provider-error\]\s*/, "");
}

function getCompetitors(response: string, domain: string) {
  return extractDomainsFromText(response, [normalizeComparableDomain(domain)]);
}

function getRankBadgeClass(rank: number | null) {
  if (rank === 1) {
    return "cursor-help bg-green-100 text-green-700 hover:bg-green-100";
  }

  if (typeof rank === "number") {
    return "cursor-help bg-orange-100 text-orange-700 hover:bg-orange-100";
  }

  return "cursor-help bg-green-100 text-green-700 hover:bg-green-100";
}

function CompetitorHoverCard({
  result,
  domain,
}: {
  result: PromptResult;
  domain: string;
}) {
  const competitors = getCompetitors(result.response, domain);
  const providerError = isLikelyProviderError(result.response);
  const providerErrorMessage = providerError ? getProviderError(result.response) : null;

  return (
    <div className="group relative inline-flex">
      {providerError ? (
        <Badge className="cursor-help bg-amber-100 text-amber-800 hover:bg-amber-100">!</Badge>
      ) : result.mentions_domain ? (
        <Badge className={getRankBadgeClass(result.rank)}>
          #{result.rank ?? "✓"}
        </Badge>
      ) : (
        <Badge variant="outline" className="cursor-help text-neutral-400">
          ✗
        </Badge>
      )}

      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-72 -translate-x-1/2 rounded-2xl border border-neutral-200 bg-white p-3 text-left shadow-xl group-hover:block">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          {providerError ? "Provider Error" : "Ranking Websites"}
        </div>

        {providerError ? (
          <p className="mt-2 text-xs leading-5 text-neutral-700">{providerErrorMessage}</p>
        ) : competitors.length > 0 ? (
          <div className="mt-3 space-y-2">
            {competitors.map((competitor) => (
              <div
                key={competitor}
                className="flex items-center gap-2 rounded-xl border border-neutral-100 px-2 py-1.5"
              >
                <Image
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(competitor)}&sz=32`}
                  alt=""
                  width={16}
                  height={16}
                  className="h-4 w-4 rounded-sm"
                  unoptimized
                />
                <span className="truncate text-xs text-neutral-700">{competitor}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-neutral-600">
            No ranking websites were detected in the stored provider response.
          </p>
        )}
      </div>
    </div>
  );
}

export function PromptsTable({
  siteId,
  prompts,
  domain,
  loading = false,
  onPromptDeleted,
}: Props) {
  async function handleDelete(promptId: string) {
    await fetch(`/api/sites/${siteId}/prompts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptId }),
    });
    onPromptDeleted?.(promptId);
  }

  if (loading) {
    return <div className="text-sm text-neutral-500">Loading prompts…</div>;
  }

  if (prompts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 py-12 text-center text-sm text-neutral-500">
        No prompts yet. Add one below or generate suggestions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 bg-neutral-50">
            <th className="px-4 py-3 text-left font-medium text-neutral-600">Prompt</th>
            {PROVIDERS.map((p) => (
              <th key={p.id} className="px-3 py-3 text-center font-medium text-neutral-600">
                {p.name}
              </th>
            ))}
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {prompts.map((prompt) => {
            const latest = latestResults(prompt.prompt_results);
            return (
              <tr key={prompt.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 text-neutral-800 max-w-xs">
                  <span title={prompt.text} className="line-clamp-2">
                    {prompt.text}
                  </span>
                </td>
                {PROVIDERS.map((p) => {
                  const result = latest[p.id];
                  if (!result) {
                    return (
                      <td key={p.id} className="px-3 py-3 text-center text-neutral-300">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={p.id} className="px-3 py-3 text-center">
                      <CompetitorHoverCard result={result} domain={domain} />
                    </td>
                  );
                })}
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-neutral-400 hover:text-red-600"
                    onClick={() => handleDelete(prompt.id)}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
