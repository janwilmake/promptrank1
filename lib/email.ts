import { Resend } from "resend";

let _resend: Resend | null = null;
const getResend = () => {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
};
const FROM = () => process.env.RESEND_FROM_EMAIL ?? "noreply@promptrank1.com";

export interface PromptResultSummary {
  prompt: string;
  results: {
    provider: string;
    mentions_domain: boolean;
    rank: number | null;
  }[];
}

export async function sendResultsEmail(
  to: string,
  domain: string,
  summaries: PromptResultSummary[]
) {
  const mentionCount = summaries.reduce(
    (acc, s) => acc + s.results.filter((r) => r.mentions_domain).length,
    0
  );
  const totalChecks = summaries.reduce((acc, s) => acc + s.results.length, 0);

  const promptRows = summaries
    .map(
      (s) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${s.prompt}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">
        ${s.results.map((r) => `${r.provider.split("/")[0]}: ${r.mentions_domain ? `#${r.rank ?? "✓"}` : "✗"}`).join(", ")}
      </td>
    </tr>`
    )
    .join("");

  await getResend().emails.send({
    from: FROM(),
    to,
    subject: `PromptRank1: Results ready for ${domain}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#111">Your AI visibility results for <strong>${domain}</strong></h1>
        <p>We tested ${summaries.length} prompts across ${new Set(summaries[0]?.results.map((r) => r.provider)).size} AI providers.</p>
        <p><strong>${domain}</strong> appeared in <strong>${mentionCount} of ${totalChecks}</strong> responses.</p>

        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:8px;text-align:left">Prompt</th>
              <th style="padding:8px;text-align:center">Results</th>
            </tr>
          </thead>
          <tbody>${promptRows}</tbody>
        </table>

        <p style="margin-top:24px">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
             style="background:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">
            View full dashboard
          </a>
        </p>

        <p style="color:#888;font-size:12px;margin-top:32px">
          PromptRank1 — Track your visibility in AI search
        </p>
      </div>
    `,
  });
}
