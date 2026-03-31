// Parallel.ai agent for domain research and prompt generation

export interface DomainResearch {
  targetAudience: string;
  niche: string;
  prompts: string[];
}

export async function researchDomainAndGeneratePrompts(
  domain: string
): Promise<DomainResearch> {
  const res = await fetch("https://api.parallel.ai/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARALLEL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `Research the website ${domain}. What does it offer? Who is the target audience? What specific problems do they solve? What would their ideal customers search for in AI assistants like ChatGPT, Claude, Gemini, or Perplexity?`,
      search_depth: "deep",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Parallel.ai error: ${text}`);
  }

  const data = await res.json();
  const researchText: string = data.result ?? data.answer ?? JSON.stringify(data);

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
        model: "anthropic/claude-3.5-sonnet",
        messages: [
          {
            role: "user",
            content: `Based on this research about ${domain}:\n\n${researchText}\n\n
Generate 8-10 realistic search prompts that the target audience would type into an AI assistant (ChatGPT, Claude, Gemini, Perplexity) when looking for products or services like those offered by ${domain}.

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

  const synthesisData = await synthesisRes.json();
  const content = synthesisData.choices?.[0]?.message?.content ?? "{}";

  try {
    return JSON.parse(content) as DomainResearch;
  } catch {
    // Fallback if parsing fails
    return {
      targetAudience: "General audience",
      niche: domain,
      prompts: [
        `What is the best tool for ${domain}?`,
        `Recommend a service similar to ${domain}`,
        `How to find services like ${domain}`,
      ],
    };
  }
}
