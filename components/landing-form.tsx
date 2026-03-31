"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

export function LandingForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = domain.trim();
    if (!trimmed) return;

    setLoading(true);

    try {
      // Store domain in sessionStorage so we can use it after OAuth callback
      sessionStorage.setItem("pending_domain", trimmed);

      await signIn.social({
        provider: "google",
        callbackURL: "/onboarding",
      });
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg">
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="yourdomain.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="h-12 flex-1 text-base"
          disabled={loading}
        />
        <Button
          type="submit"
          disabled={loading || !domain.trim()}
          className="h-12 px-6"
        >
          {loading ? "Redirecting…" : "Check my site →"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-3 text-sm text-neutral-500">
        Free to check once. No credit card required.
      </p>
    </form>
  );
}
