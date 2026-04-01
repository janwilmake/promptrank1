"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UpgradeRequiredDialog } from "@/components/upgrade-required-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Site {
  id: string;
  domain: string;
  last_checked: string | null;
  initial_prompt_generation_status: string;
  initial_prompt_generation_error: string | null;
}

interface Props {
  sites: Site[];
  selectedId: string | null;
  isPaid: boolean;
  onSelect: (id: string) => void;
  onSiteAdded: (site: Site) => void;
}

export function SiteSelector({ sites, selectedId, isPaid, onSelect, onSiteAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.code === "free_plan_site_limit") {
          setOpen(false);
          setShowUpgradeDialog(true);
          return;
        }
        throw new Error(data?.error ?? "Failed to add site");
      }

      const site = await res.json();
      if (site.existing) {
        onSelect(site.id);
        setDomain("");
        setOpen(false);
        return;
      }

      // Kick off agent research
      fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: site.domain, siteId: site.id, mode: "initial" }),
      });

      onSiteAdded(site);
      setDomain("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {sites.map((site) => (
        <Button
          key={site.id}
          variant={selectedId === site.id ? "default" : "outline"}
          size="sm"
          onClick={() => onSelect(site.id)}
        >
          {site.domain}
        </Button>
      ))}

      {!isPaid ? (
        <>
          <button
            type="button"
            onClick={() => setShowUpgradeDialog(true)}
            className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium text-neutral-500 opacity-70 shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-disabled="true"
          >
            + Add site
          </button>
          <UpgradeRequiredDialog
            open={showUpgradeDialog}
            onOpenChange={setShowUpgradeDialog}
            title="Premium required for another website"
            description="Free accounts can track one website. Go back to your dashboard or upgrade to premium to add another site."
          />
        </>
      ) : (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          + Add site
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a new site</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <Input
              placeholder="yourdomain.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={loading}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading || !domain.trim()} className="w-full">
              {loading ? "Adding…" : "Add site"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
