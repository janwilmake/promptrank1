"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PaywallBanner() {
  const [siteCount, setSiteCount] = useState(1);
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", siteCount }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-neutral-900">
            Track weekly for $35/month per site
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            You checked your site once for free. Upgrade to monitor AI visibility weekly
            and get email alerts when your ranking changes.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <span>Sites:</span>
            <select
              value={siteCount}
              onChange={(e) => setSiteCount(parseInt(e.target.value, 10))}
              className="rounded border border-neutral-200 px-2 py-1 text-sm"
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} — ${n * 35}/mo
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleSubscribe} disabled={loading}>
            {loading ? "Redirecting…" : "Upgrade"}
          </Button>
        </div>
      </div>
    </div>
  );
}
