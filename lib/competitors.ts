const DOMAIN_REGEX = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi;
const URL_REGEX = /\bhttps?:\/\/[^\s)]+/gi;

function normalizeDomain(value: string) {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/[),.;:]+$/, "")
    .trim();
}

export function extractDomainsFromText(text: string, excludedDomains: string[] = []) {
  const excluded = new Set(excludedDomains.map(normalizeDomain));
  const domains = new Set<string>();

  for (const match of text.matchAll(DOMAIN_REGEX)) {
    const candidate = normalizeDomain(match[1] ?? match[0] ?? "");
    if (!candidate) continue;
    if (!candidate.includes(".")) continue;
    if (excluded.has(candidate)) continue;
    domains.add(candidate);
  }

  return Array.from(domains);
}

export function normalizeComparableDomain(domain: string) {
  return normalizeDomain(domain);
}

export function extractUrlsFromText(text: string) {
  const urls = new Set<string>();

  for (const match of text.matchAll(URL_REGEX)) {
    const candidate = match[0]?.replace(/[),.;:]+$/, "").trim();
    if (!candidate) continue;
    urls.add(candidate);
  }

  return Array.from(urls);
}

export function getDomainForUrl(url: string) {
  try {
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return null;
  }
}

export function isLikelyProviderError(response: string) {
  return response.startsWith("[provider-error]");
}
