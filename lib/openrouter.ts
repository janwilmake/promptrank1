// Providers that support web search via OpenRouter plugins
export const PROVIDERS = [
  { id: "openai/gpt-4o-search-preview", name: "ChatGPT" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini" },
  { id: "x-ai/grok-2-1212", name: "xAI Grok" },
  { id: "perplexity/sonar-pro", name: "Perplexity" },
] as const;

export type Provider = (typeof PROVIDERS)[number];

export interface PromptResult {
  provider: string;
  response: string;
  mentions_domain: boolean;
  rank: number | null;
}

export async function testPrompt(
  prompt: string,
  domain: string,
  model: string
): Promise<PromptResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "PromptRank1",
    },
    body: JSON.stringify({
      model,
      plugins: [{ id: "web" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error for ${model}: ${text}`);
  }

  const data = await res.json();
  const response: string = data.choices?.[0]?.message?.content ?? "";

  // Check if domain appears in the response
  const normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const mentions_domain = response.toLowerCase().includes(normalizedDomain);

  // Try to find rank: look for numbered lists where domain appears
  let rank: number | null = null;
  if (mentions_domain) {
    const lines = response.split("\n");
    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s/);
      if (match && line.toLowerCase().includes(normalizedDomain)) {
        rank = parseInt(match[1], 10);
        break;
      }
    }
    // If mentioned but no numbered list, treat as rank 1
    if (rank === null) rank = 1;
  }

  return {
    provider: model,
    response,
    mentions_domain,
    rank,
  };
}

export async function testPromptAllProviders(
  prompt: string,
  domain: string
): Promise<PromptResult[]> {
  const results = await Promise.allSettled(
    PROVIDERS.map((p) => testPrompt(prompt, domain, p.id))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<PromptResult> => r.status === "fulfilled")
    .map((r) => r.value);
}
