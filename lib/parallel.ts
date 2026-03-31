// Parallel.ai agent for domain research and prompt generation

export interface DomainResearch {
  targetAudience: string;
  niche: string;
  prompts: string[];
}

const MAX_GENERATED_PROMPTS = 5;

function normalizePrompts(prompts: unknown): string[] {
  if (!Array.isArray(prompts)) {
    return [];
  }

  return [...new Set(
    prompts
      .filter((prompt): prompt is string => typeof prompt === "string")
      .map((prompt) => prompt.trim())
      .filter(Boolean)
  )].slice(0, MAX_GENERATED_PROMPTS);
}

function fallbackResearch(domain: string): DomainResearch {
  return {
    targetAudience: "General audience",
    niche: domain,
    prompts: [
      `What is the best tool for ${domain}?`,
      `Recommend a service similar to ${domain}`,
      `How to find services like ${domain}`,
      `What are the top alternatives to ${domain}?`,
      `Which companies offer services like ${domain}?`,
    ],
  };
}

function extractJsonObject(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

function normalizeResearch(domain: string, value: unknown): DomainResearch {
  const fallback = fallbackResearch(domain);

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const prompts = normalizePrompts(record.prompts);

  return {
    targetAudience:
      typeof record.targetAudience === "string" && record.targetAudience.trim()
        ? record.targetAudience.trim()
        : fallback.targetAudience,
    niche:
      typeof record.niche === "string" && record.niche.trim()
        ? record.niche.trim()
        : fallback.niche,
    prompts: prompts.length > 0 ? prompts : fallback.prompts,
  };
}

export async function researchDomainAndGeneratePrompts(
  domain: string
): Promise<DomainResearch> {
  const res = await fetch("https://api.parallel.ai/v1beta/search", {
    method: "POST",
    headers: {
      "x-api-key": process.env.PARALLEL_API_KEY ?? "",
      "Content-Type": "application/json",
      "parallel-beta": "search-extract-2025-10-10",
    },
    body: JSON.stringify({
      objective: `Research the website ${domain}. What does it offer? Who is the target audience? What specific problems do they solve? What would their ideal customers search for in AI assistants like ChatGPT, Claude, Gemini, or Perplexity?`,
      search_queries: [
        `${domain} what is it about`,
        `${domain} target audience customers`,
        `${domain} products services features`,
      ],
      max_results: 10,
      excerpts: { max_chars_per_result: 5000 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Parallel.ai error: ${text}`);
  }

  const data = await res.json();
  const researchText: string = (data.results ?? [])
    .map((r: { url: string; title: string; excerpts?: string[] }) =>
      `${r.title} (${r.url}):\n${(r.excerpts ?? []).join("\n")}`
    )
    .join("\n\n") || JSON.stringify(data);

  // Use OpenRouter to synthesize prompts from the research
  const synthesisRes = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "PromptRank1",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4.6",
        messages: [
          {
            role: "user",
            content: `Based on this research about ${domain}:\n\n${researchText}\n\n
Generate exactly 5 realistic search prompts that the target audience would type into an AI assistant (ChatGPT, Claude, Gemini, Perplexity) when looking for products or services like those offered by ${domain}.

Return a JSON object with this exact structure:
{
  "targetAudience": "brief description of target audience",
  "niche": "specific niche/category",
  "prompts": ["prompt 1", "prompt 2", ...]
}

Each prompt should:
- Be a natural question or request someone would actually type
- Be specific enough to find relevant results
- Represent different angles (problem-based, solution-based, comparison, recommendation)

Return only valid JSON, no markdown.`,
          },
        ],
      }),
    }
  );

  if (!synthesisRes.ok) {
    const text = await synthesisRes.text();
    throw new Error(`OpenRouter synthesis error: ${text}`);
  }

  const synthesisData = await synthesisRes.json();
  const content = synthesisData.choices?.[0]?.message?.content ?? "{}";

  try {
    return normalizeResearch(domain, JSON.parse(extractJsonObject(content)));
  } catch {
    return fallbackResearch(domain);
  }
}
