"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UpgradeRequiredDialog } from "@/components/upgrade-required-dialog";

interface Props {
  siteId: string;
  domain: string;
  isPaid: boolean;
  onChanged?: () => void;
}

export function AddPromptForm({ siteId, domain, isPaid, onChanged }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setStatus("");

    try {
      const res = await fetch(`/api/sites/${siteId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        setText("");
        setStatus("Prompt added — testing in progress.");
        onChanged?.();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!isPaid) {
      setShowUpgradeDialog(true);
      return;
    }

    setGenerating(true);
    setStatus("Generating prompt suggestions…");

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, siteId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to generate suggestions");
      }
      setStatus("New prompts generated and queued for testing.");
      onChanged?.();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to generate suggestions."
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          placeholder="Enter a prompt to track…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !text.trim()}>
          {loading ? "Adding…" : "Add prompt"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
          className={!isPaid ? "cursor-pointer text-neutral-500 opacity-70" : undefined}
          aria-disabled={!isPaid}
        >
          {generating ? "Generating…" : "Generate suggestions"}
        </Button>
        {status && <span className="text-sm text-neutral-500">{status}</span>}
      </div>

      <UpgradeRequiredDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        title="Premium required for suggestions"
        description="Prompt suggestions are available on premium. Go back to your dashboard or upgrade to premium to generate more suggestions."
      />
    </div>
  );
}
