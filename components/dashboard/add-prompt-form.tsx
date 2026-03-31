"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  siteId: string;
  domain: string;
}

export function AddPromptForm({ siteId, domain }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");

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
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setStatus("Generating prompt suggestions…");

    try {
      await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, siteId }),
      });
      setStatus("New prompts generated and queued for testing.");
    } catch {
      setStatus("Failed to generate suggestions.");
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
        >
          {generating ? "Generating…" : "Generate suggestions"}
        </Button>
        {status && <span className="text-sm text-neutral-500">{status}</span>}
      </div>
    </div>
  );
}
