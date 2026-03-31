import { LandingForm } from "@/components/landing-form";

export const metadata = {
  title: "PromptRank1 — Track your visibility in AI search",
  description:
    "Find out if your website appears when people ask ChatGPT, Claude, Gemini, Perplexity, or xAI about topics in your niche. Track your AI search visibility.",
  openGraph: {
    title: "PromptRank1 — Track your visibility in AI search",
    description:
      "Find out if your website appears when people ask AI assistants about topics in your niche.",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
        <div className="mb-4 inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm text-neutral-600">
          AI Search Visibility Tracker
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-neutral-900 sm:text-6xl">
          Does your site appear in
          <br />
          <span className="text-neutral-500">AI search results?</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600">
          When people ask ChatGPT, Claude, Gemini, or Perplexity about your niche,
          does your website come up? PromptRank1 finds out — and keeps tracking it weekly.
        </p>

        <div className="mt-10">
          <LandingForm />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="mb-10 text-center text-2xl font-semibold text-neutral-900">
          How it works
        </h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Enter your domain",
              description:
                "We research your website and identify what your target audience searches for in AI assistants.",
            },
            {
              step: "2",
              title: "We test the prompts",
              description:
                "Your prompts are tested against ChatGPT, Claude, Gemini, Perplexity, and xAI — all at once.",
            },
            {
              step: "3",
              title: "Track your rank",
              description:
                "See exactly where you appear (or don't) and monitor changes week over week.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
                {item.step}
              </div>
              <h3 className="mb-2 font-semibold text-neutral-900">{item.title}</h3>
              <p className="text-sm text-neutral-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Providers */}
      <section className="border-t border-neutral-100 bg-neutral-50 py-12">
        <p className="mb-6 text-center text-sm text-neutral-500">
          Tested across all major AI assistants
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 px-6 font-medium text-neutral-400">
          {["ChatGPT", "Claude", "Gemini", "Perplexity", "xAI Grok"].map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h2 className="mb-4 text-2xl font-semibold text-neutral-900">
          Weekly tracking from $35/month
        </h2>
        <p className="text-neutral-600">
          Free first check. Upgrade to track your prompts weekly, monitor competitors,
          and get email alerts when your visibility changes.
        </p>
      </section>
    </main>
  );
}
