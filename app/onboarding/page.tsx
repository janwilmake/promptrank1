"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [status, setStatus] = useState("Setting up your account…");

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/");
      return;
    }

    async function setup() {
      const domain =
        typeof window !== "undefined"
          ? sessionStorage.getItem("pending_domain")
          : null;

      if (!domain) {
        router.push("/dashboard");
        return;
      }

      try {
        setStatus("Creating your site…");
        const siteRes = await fetch("/api/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        });

        if (!siteRes.ok) throw new Error("Failed to create site");
        const site = await siteRes.json();

        setStatus("Researching your domain and generating prompts…");
        await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, siteId: site.id }),
        });

        sessionStorage.removeItem("pending_domain");
        setStatus("Almost done — testing your prompts…");

        router.push(`/dashboard?siteId=${site.id}&new=true`);
      } catch {
        setStatus("Something went wrong. Redirecting to dashboard…");
        setTimeout(() => router.push("/dashboard"), 2000);
      }
    }

    setup();
  }, [session, isPending, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
        <p className="text-neutral-600">{status}</p>
      </div>
    </div>
  );
}
