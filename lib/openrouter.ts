import {
  extractDomainsFromText,
  isLikelyProviderError,
  normalizeComparableDomain,
} from "@/lib/competitors";
import { logError, logInfo } from "@/lib/log";

// Providers that support web search via OpenRouter plugins
export const PROVIDERS = [
  { id: "openai/gpt-5.4", name: "ChatGPT" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude" },
  { id: "google/gemini-3.1-pro-preview", name: "Gemini" },
  { id: "x-ai/grok-4.20-beta", name: "xAI Grok" },
  { id: "perplexity/sonar-pro-search", name: "Perplexity" },
] as const;

export type Provider = (typeof PROVIDERS)[number];

export interface PromptResult {
  provider: string;
  response: string;
  mentions_domain: boolean;
  rank: number | null;
  competitor_domains: string[];
}

const PROVIDER_NAMES = Object.fromEntries(PROVIDERS.map((provider) => [provider.id, provider.name]));

function providerErrorResponse(message: string) {
  return `[provider-error] ${message}`;
}

function trimForLog(value: string, maxLength = 700) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

async function classifyCompetitorDomains({
  prompt,
  domain,
  providerName,
  response,
  candidateDomains,
}: {
  prompt: string;
  domain: string;
  providerName: string;
  response: string;
  candidateDomains: string[];
}) {
  if (candidateDomains.length === 0) return [];
  if (isLikelyProviderError(response)) return [];

  const normalizedDomain = normalizeComparableDomain(domain);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "PromptRank1",
    },
    body: JSON.stringify({
      model: "openai/gpt-5.4",
      messages: [
        {
          role: "system",
          content:
            "You classify which domains are actual commercial competitors of a target website for a given user prompt. Exclude blogs, magazines, docs, forums, directories, marketplaces, social networks, Wikipedia, review sites, and informational websites unless they directly sell the same product/service as the target website. Return strict JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            target_domain: normalizedDomain,
            search_prompt: prompt,
            provider: providerName,
            candidate_domains: candidateDomains,
            provider_response_excerpt: trimForLog(response, 2400),
            return_format: {
              competitor_domains: ["subset of candidate_domains"],
            },
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "competitor_domains",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              competitor_domains: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["competitor_domains"],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logError("openrouter", "Competitor classification failed", {
      providerName,
      domain: normalizedDomain,
      status: res.status,
      responsePreview: trimForLog(text),
    });
    return [];
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(content) as { competitor_domains?: string[] };
    return (parsed.competitor_domains ?? []).filter((candidate) =>
      candidateDomains.includes(candidate)
    );
  } catch (error) {
    logError("openrouter", "Competitor classification returned invalid JSON", {
      providerName,
      domain: normalizedDomain,
      error: error instanceof Error ? error : new Error(String(error)),
      responsePreview: trimForLog(content),
    });
    return [];
  }
}

export async function testPrompt(
  prompt: string,
  domain: string,
  model: string
): Promise<PromptResult> {
  const providerName = PROVIDER_NAMES[model] ?? model;

  logInfo("openrouter", "Provider request started", {
    provider: model,
    providerName,
    domain,
    promptPreview: trimForLog(prompt, 180),
  });

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
    logError("openrouter", "Provider request failed", {
      provider: model,
      providerName,
      domain,
      status: res.status,
      responsePreview: trimForLog(text),
    });
    throw new Error(`OpenRouter error for ${model}: ${text}`);
  }

  const data = await res.json();
  const response: string = data.choices?.[0]?.message?.content ?? "";

  // Check if domain appears in the response
  const normalizedDomain = normalizeComparableDomain(domain);
  const mentions_domain = response.toLowerCase().includes(normalizedDomain);
  const rankingWebsites = extractDomainsFromText(response, [normalizedDomain]);
  const competitorDomains = await classifyCompetitorDomains({
    prompt,
    domain,
    providerName,
    response,
    candidateDomains: rankingWebsites,
  });

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

  logInfo("openrouter", "Provider request finished", {
    provider: model,
    providerName,
    domain,
    openrouterId: typeof data.id === "string" ? data.id : undefined,
    mentionsDomain: mentions_domain,
    rank,
    rankingWebsiteCount: rankingWebsites.length,
    competitorCount: competitorDomains.length,
    responsePreview: trimForLog(response),
  });

  return {
    provider: model,
    response,
    mentions_domain,
    rank,
    competitor_domains: competitorDomains,
  };
}

export async function testPromptAllProviders(
  prompt: string,
  domain: string
): Promise<PromptResult[]> {
  const results = await Promise.allSettled(
    PROVIDERS.map((p) => testPrompt(prompt, domain, p.id))
  );

  return results.map((result, index) => {
    const provider = PROVIDERS[index];

    if (result.status === "fulfilled") {
      return result.value;
    }

    const message =
      result.reason instanceof Error ? result.reason.message : String(result.reason);

    logError("openrouter", "Provider result converted into stored error state", {
      provider: provider.id,
      providerName: provider.name,
      domain,
      error: result.reason instanceof Error ? result.reason : new Error(message),
    });

    return {
      provider: provider.id,
      response: providerErrorResponse(message),
      mentions_domain: false,
      rank: null,
      competitor_domains: [],
    };
  });
}
