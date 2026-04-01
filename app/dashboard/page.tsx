"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CompetitorsOverview } from "@/components/dashboard/competitors-overview";
import { RankingWebsitesOverview } from "@/components/dashboard/ranking-websites-overview";
import { SiteSelector } from "@/components/dashboard/site-selector";
import { Prompt, PromptsTable } from "@/components/dashboard/prompts-table";
import { AddPromptForm } from "@/components/dashboard/add-prompt-form";
import { PaywallBanner } from "@/components/dashboard/paywall-banner";

interface Site {
  id: string;
  domain: string;
  last_checked: string | null;
  initial_prompt_generation_status: string;
  initial_prompt_generation_error: string | null;
}

interface Subscription {
  status: string;
  site_count: number;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    searchParams.get("siteId")
  );
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(
    Boolean(searchParams.get("siteId"))
  );
  const [isNew] = useState(searchParams.get("new") === "true");
  const [retryingInitialGeneration, setRetryingInitialGeneration] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/");
      return;
    }

    async function load() {
      const [sitesRes, subRes] = await Promise.all([
        fetch("/api/sites"),
        fetch("/api/billing/subscription"),
      ]);

      const sitesData = sitesRes.ok ? await sitesRes.json() : [];
      const subData = subRes.ok ? await subRes.json() : null;

      setSites(sitesData);
      setSubscription(subData);

      if (!selectedSiteId && sitesData.length > 0) {
        setPromptsLoading(true);
        setSelectedSiteId(sitesData[0].id);
      }

      setLoading(false);
    }

    load();
  }, [session, isPending, router, selectedSiteId]);

  useEffect(() => {
    if (!selectedSiteId) {
      return;
    }

    let cancelled = false;

    fetch(`/api/sites/${selectedSiteId}/prompts`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          setPrompts(Array.isArray(data) ? data : []);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPromptsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSiteId]);

  if (isPending || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
      </div>
    );
  }

  const isPaid = subscription?.status === "active";
  const selectedSite = sites.find((s) => s.id === selectedSiteId);

  async function refreshSites() {
    const sitesRes = await fetch("/api/sites");
    const sitesData = sitesRes.ok ? await sitesRes.json() : [];
    setSites(sitesData);
  }

  async function refreshPrompts(siteId: string) {
    setPromptsLoading(true);
    try {
      const response = await fetch(`/api/sites/${siteId}/prompts`);
      const data = await response.json();
      setPrompts(Array.isArray(data) ? data : []);
    } finally {
      setPromptsLoading(false);
    }
  }

  async function handleRetryInitialGeneration() {
    if (!selectedSite) {
      return;
    }

    setRetryingInitialGeneration(true);

    try {
      await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: selectedSite.domain,
          siteId: selectedSite.id,
          mode: "initial",
        }),
      });
    } finally {
      await refreshSites();
      await refreshPrompts(selectedSite.id);
      setRetryingInitialGeneration(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="font-semibold text-neutral-900">PromptRank1</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-500">{session?.user?.email}</span>
            {isPaid && (
              <Badge variant="secondary">Pro</Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut().then(() => router.push("/"))}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {!isPaid && <PaywallBanner />}

        {isNew && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Your prompts are being tested now — results will appear below and we&apos;ll email you when done.
          </div>
        )}

        {/* Site selector */}
        <div className="mb-6 flex items-center gap-4">
          <SiteSelector
            sites={sites}
            selectedId={selectedSiteId}
            onSelect={(siteId) => {
              setPromptsLoading(true);
              setSelectedSiteId(siteId);
            }}
            onSiteAdded={(site) => {
              setSites((prev) => [site, ...prev]);
              setPromptsLoading(true);
              setSelectedSiteId(site.id);
            }}
          />
        </div>

        {selectedSite && (
          <>
            {selectedSite.initial_prompt_generation_status === "failed" && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">Prompt generation failed.</p>
                    {selectedSite.initial_prompt_generation_error && (
                      <p className="mt-1 break-words text-red-700">
                        {selectedSite.initial_prompt_generation_error}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryInitialGeneration}
                    disabled={retryingInitialGeneration}
                    className="border-red-300 bg-white text-red-800 hover:bg-red-100"
                  >
                    {retryingInitialGeneration ? "Retrying…" : "Retry generation"}
                  </Button>
                </div>
              </div>
            )}

            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-neutral-900">
                  {selectedSite.domain}
                </h1>
                {selectedSite.last_checked && (
                  <p className="text-sm text-neutral-500">
                    Last checked:{" "}
                    {new Date(selectedSite.last_checked).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            <Separator className="mb-6" />

            <div className="space-y-6">
              <PromptsTable
                siteId={selectedSite.id}
                prompts={prompts}
                domain={selectedSite.domain}
                loading={promptsLoading}
                onPromptDeleted={(promptId) =>
                  setPrompts((prev) => prev.filter((prompt) => prompt.id !== promptId))
                }
              />

              <AddPromptForm
                siteId={selectedSite.id}
                domain={selectedSite.domain}
                onChanged={() => {
                  refreshPrompts(selectedSite.id);
                  refreshSites();
                }}
              />

              <CompetitorsOverview
                prompts={prompts}
                loading={promptsLoading}
              />

              <RankingWebsitesOverview
                prompts={prompts}
                domain={selectedSite.domain}
                loading={promptsLoading}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
