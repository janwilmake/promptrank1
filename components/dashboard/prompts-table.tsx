"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PromptResultDialog } from "@/components/dashboard/prompt-result-dialog";
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
    return "bg-green-100 text-green-700 hover:bg-green-200";
  }

  if (typeof rank === "number") {
    return "bg-orange-100 text-orange-700 hover:bg-orange-200";
  }

  return "bg-green-100 text-green-700 hover:bg-green-200";
}

function ResultBadgeButton({
  promptText,
  result,
  domain,
}: {
  promptText: string;
  result: PromptResult;
  domain: string;
}) {
  const [open, setOpen] = useState(false);
  const providerError = isLikelyProviderError(result.response);
  const competitors = getCompetitors(result.response, domain);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
        aria-label={`View ${result.provider} result details for prompt: ${promptText}`}
        title={providerError ? getProviderError(result.response) : competitors.join(", ")}
      >
        {providerError ? (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">!</Badge>
        ) : result.mentions_domain ? (
          <Badge className={getRankBadgeClass(result.rank)}>#{result.rank ?? "✓"}</Badge>
        ) : (
          <Badge variant="outline" className="text-neutral-400 hover:bg-neutral-100">
            ✗
          </Badge>
        )}
      </button>

      <PromptResultDialog
        selectedResult={
          open
            ? {
                promptText,
                domain,
                result,
              }
            : null
        }
        onOpenChange={setOpen}
      />
    </>
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
                      <ResultBadgeButton
                        promptText={prompt.text}
                        result={result}
                        domain={domain}
                      />
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
