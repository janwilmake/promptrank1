"use client";

import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { PromptResult } from "@/components/dashboard/prompts-table";
import {
  extractDomainsFromText,
  isLikelyProviderError,
  normalizeComparableDomain,
} from "@/lib/competitors";
import { PROVIDERS } from "@/lib/openrouter";

type SelectedPromptResult = {
  promptText: string;
  domain: string;
  result: PromptResult;
};

interface Props {
  selectedResult: SelectedPromptResult | null;
  onOpenChange: (open: boolean) => void;
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; language: string; code: string };

function getProviderName(provider: string) {
  return PROVIDERS.find((candidate) => candidate.id === provider)?.name ?? provider;
}

function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];

  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fenceMatch = trimmed.match(/^```([\w-]*)\s*$/);
    if (fenceMatch) {
      const codeLines: string[] = [];
      const language = fenceMatch[1] ?? "";
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n").trimEnd(),
      });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({
        type: "blockquote",
        text: quoteLines.join(" ").trim(),
      });
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    const nextLine = lines[index + 1]?.trim() ?? "";
    const isTableHeader = trimmed.includes("|");
    const isTableDivider = /^[:\-| ]+$/.test(nextLine) && nextLine.includes("-");

    if (isTableHeader && isTableDivider) {
      const parseTableRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());

      const headers = parseTableRow(trimmed);
      const rows: string[][] = [];

      index += 2;

      while (index < lines.length) {
        const rowLine = lines[index].trim();
        if (!rowLine || !rowLine.includes("|")) {
          break;
        }

        rows.push(parseTableRow(rowLine));
        index += 1;
      }

      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];

      while (index < lines.length) {
        const listLine = lines[index].trim();
        const match = ordered
          ? listLine.match(/^\d+\.\s+(.*)$/)
          : listLine.match(/^[-*]\s+(.*)$/);

        if (!match) {
          break;
        }

        items.push(match[1].trim());
        index += 1;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;

    while (index < lines.length) {
      const nextTrimmed = lines[index].trim();

      if (
        !nextTrimmed ||
        /^```/.test(nextTrimmed) ||
        /^(#{1,6})\s+/.test(nextTrimmed) ||
        /^>\s?/.test(nextTrimmed) ||
        /^[-*]\s+/.test(nextTrimmed) ||
        /^\d+\.\s+/.test(nextTrimmed)
      ) {
        break;
      }

      paragraphLines.push(nextTrimmed);
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderInlineMarkdown(text: string) {
  const segments: Array<
    | { type: "text" | "code" | "strong"; value: string }
    | { type: "link"; label: string; href: string }
  > = [];
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);

  for (const part of parts) {
    if (part.startsWith("`") && part.endsWith("`")) {
      segments.push({ type: "code", value: part.slice(1, -1) });
      continue;
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      segments.push({ type: "strong", value: part.slice(2, -2) });
      continue;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      segments.push({
        type: "link",
        label: linkMatch[1],
        href: linkMatch[2],
      });
      continue;
    }

    segments.push({ type: "text", value: part });
  }

  return segments.map((segment, index) => {
    if (segment.type === "code") {
      return (
        <code
          key={`${segment.type}-${index}`}
          className="rounded bg-neutral-200 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-900"
        >
          {segment.value}
        </code>
      );
    }

    if (segment.type === "strong") {
      return (
        <strong key={`${segment.type}-${index}`} className="font-semibold text-neutral-950">
          {segment.value}
        </strong>
      );
    }

    if (segment.type === "link") {
      return (
        <a
          key={`${segment.type}-${index}`}
          href={segment.href}
          target="_blank"
          rel="noreferrer"
          className="text-neutral-950 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-700 hover:decoration-neutral-500"
        >
          {segment.label}
        </a>
      );
    }

    return <span key={`${segment.type}-${index}`}>{segment.value}</span>;
  });
}

function MarkdownContent({ markdown }: { markdown: string }) {
  const blocks = splitMarkdownBlocks(markdown);

  if (blocks.length === 0) {
    return (
      <p className="text-sm leading-7 whitespace-pre-wrap text-neutral-700">{markdown}</p>
    );
  }

  return (
    <div className="space-y-4 text-sm leading-7 text-neutral-700">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const HeadingTag = block.level <= 2 ? "h3" : "h4";
          return (
            <HeadingTag
              key={`heading-${index}`}
              className={
                block.level <= 2
                  ? "text-base font-semibold text-neutral-950"
                  : "text-sm font-semibold uppercase tracking-[0.14em] text-neutral-500"
              }
            >
              {renderInlineMarkdown(block.text)}
            </HeadingTag>
          );
        }

        if (block.type === "paragraph") {
          return <p key={`paragraph-${index}`}>{renderInlineMarkdown(block.text)}</p>;
        }

        if (block.type === "blockquote") {
          return (
            <blockquote
              key={`blockquote-${index}`}
              className="rounded-r-2xl border-l-2 border-neutral-300 bg-neutral-50 px-4 py-3 text-neutral-600"
            >
              {renderInlineMarkdown(block.text)}
            </blockquote>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={`list-${index}`}
              className={block.ordered ? "space-y-2 pl-5 list-decimal" : "space-y-2 pl-5 list-disc"}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`list-item-${index}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={`table-${index}`}
              className="overflow-x-auto rounded-2xl border border-neutral-200"
            >
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-neutral-100">
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th
                        key={`table-header-${index}-${headerIndex}`}
                        className="border-b border-neutral-200 px-4 py-3 font-semibold text-neutral-900"
                      >
                        {renderInlineMarkdown(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`table-row-${index}-${rowIndex}`} className="border-b border-neutral-100 last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`table-cell-${index}-${rowIndex}-${cellIndex}`}
                          className="px-4 py-3 align-top text-neutral-700"
                        >
                          {renderInlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <pre
            key={`code-${index}`}
            className="overflow-x-auto rounded-2xl border border-neutral-200 bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-100"
          >
            <code>{block.code}</code>
          </pre>
        );
      })}
    </div>
  );
}

function DomainList({
  title,
  emptyMessage,
  domains,
}: {
  title: string;
  emptyMessage: string;
  domains: string[];
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          {title}
        </h3>
        <span className="text-xs text-neutral-400">{domains.length}</span>
      </div>

      {domains.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">{emptyMessage}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {domains.map((entry) => (
            <div
              key={entry}
              className="flex items-center gap-3 rounded-xl border border-white bg-white px-3 py-2"
            >
              <Image
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(entry)}&sz=32`}
                alt=""
                width={18}
                height={18}
                className="h-[18px] w-[18px] rounded-sm"
                unoptimized
              />
              <span className="truncate text-sm text-neutral-800">{entry}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PromptResultDialog({ selectedResult, onOpenChange }: Props) {
  if (!selectedResult) {
    return null;
  }

  const { promptText, domain, result } = selectedResult;
  const rankingWebsites = extractDomainsFromText(result.response, [
    normalizeComparableDomain(domain),
  ]);
  const providerError = isLikelyProviderError(result.response);
  const providerName = getProviderName(result.provider);

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[min(90vh,960px)] max-w-4xl overflow-y-auto p-0 sm:max-w-4xl">
        <div className="border-b border-neutral-200 bg-white px-6 py-5">
          <DialogHeader className="gap-3 pr-10">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{providerName}</Badge>
              {providerError ? (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Provider error</Badge>
              ) : result.mentions_domain ? (
                <Badge
                  className={
                    result.rank === 1
                      ? "bg-green-100 text-green-700 hover:bg-green-100"
                      : "bg-orange-100 text-orange-700 hover:bg-orange-100"
                  }
                >
                  #{result.rank ?? "✓"}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-neutral-500">
                  Not ranked
                </Badge>
              )}
            </div>
            <DialogTitle className="text-lg leading-7 text-neutral-950">
              {promptText}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-neutral-600">
              Review the raw provider answer, the extracted ranking websites, and the domains
              classified as direct competitors for <span className="font-medium">{domain}</span>.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <DomainList
              title="Competitors"
              domains={result.competitor_domains ?? []}
              emptyMessage="No direct competitors were classified for this provider result."
            />
            <DomainList
              title="Ranking Websites"
              domains={rankingWebsites}
              emptyMessage="No ranking websites were extracted from the stored provider response."
            />
          </div>

          <section className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Prompt Result
              </h3>
            </div>
            <div className="px-5 py-5">
              {providerError ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  {result.response.replace(/^\[provider-error\]\s*/, "")}
                </p>
              ) : (
                <MarkdownContent markdown={result.response} />
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
