"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SiteSelector } from "@/components/dashboard/site-selector";
import { PromptsTable } from "@/components/dashboard/prompts-table";
import { AddPromptForm } from "@/components/dashboard/add-prompt-form";
import { PaywallBanner } from "@/components/dashboard/paywall-banner";

interface Site {
  id: string;
  domain: string;
  last_checked: string | null;
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
  const [isNew] = useState(searchParams.get("new") === "true");

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
        setSelectedSiteId(sitesData[0].id);
      }

      setLoading(false);
    }

    load();
  }, [session, isPending, router, selectedSiteId]);

  if (isPending || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
      </div>
    );
  }

  const isPaid = subscription?.status === "active";
  const selectedSite = sites.find((s) => s.id === selectedSiteId);

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
            Your prompts are being tested now — results will appear below and we'll email you when done.
          </div>
        )}

        {/* Site selector */}
        <div className="mb-6 flex items-center gap-4">
          <SiteSelector
            sites={sites}
            selectedId={selectedSiteId}
            onSelect={setSelectedSiteId}
            onSiteAdded={(site) => {
              setSites((prev) => [site, ...prev]);
              setSelectedSiteId(site.id);
            }}
          />
        </div>

        {selectedSite && (
          <>
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

            <PromptsTable siteId={selectedSite.id} domain={selectedSite.domain} />

            <div className="mt-6">
              <AddPromptForm siteId={selectedSite.id} domain={selectedSite.domain} />
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
