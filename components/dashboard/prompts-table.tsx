"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROVIDERS } from "@/lib/openrouter";

interface PromptResult {
  id: string;
  provider: string;
  mentions_domain: boolean;
  rank: number | null;
  checked_at: string;
}

interface Prompt {
  id: string;
  text: string;
  created_at: string;
  prompt_results: PromptResult[];
}

interface Props {
  siteId: string;
  domain: string;
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

export function PromptsTable({ siteId, domain }: Props) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sites/${siteId}/prompts`)
      .then((r) => r.json())
      .then((data) => {
        setPrompts(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, [siteId]);

  async function handleDelete(promptId: string) {
    await fetch(`/api/sites/${siteId}/prompts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptId }),
    });
    setPrompts((prev) => prev.filter((p) => p.id !== promptId));
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

  const providerNames: Record<string, string> = Object.fromEntries(
    PROVIDERS.map((p) => [p.id, p.name])
  );

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
                      {result.mentions_domain ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                          #{result.rank ?? "✓"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-neutral-400">
                          ✗
                        </Badge>
                      )}
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
