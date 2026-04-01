"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { UpgradeRequiredDialog } from "@/components/upgrade-required-dialog";
import { useSession } from "@/lib/auth-client";

const ONBOARDING_LOCK_KEY = "onboarding_setup_lock";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [status, setStatus] = useState("Setting up your account…");
  const [existingSiteId, setExistingSiteId] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

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
      let createdSiteId: string | null = null;

      if (!domain) {
        router.push("/dashboard");
        return;
      }

      const lockValue = sessionStorage.getItem(ONBOARDING_LOCK_KEY);
      if (lockValue === domain) {
        return;
      }

      sessionStorage.setItem(ONBOARDING_LOCK_KEY, domain);

      try {
        setStatus("Creating your site…");
        const siteRes = await fetch("/api/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain })
        });

        const siteData = await siteRes.json().catch(() => null);

        if (!siteRes.ok) {
          if (siteData?.code === "free_plan_site_limit") {
            sessionStorage.removeItem("pending_domain");
            sessionStorage.removeItem(ONBOARDING_LOCK_KEY);
            setStatus("Premium required to add another website.");
            setShowUpgradeDialog(true);
            return;
          }

          throw new Error(siteData?.error ?? "Failed to create site");
        }

        const site = siteData;
        createdSiteId = site.id;

        if (site.existing) {
          sessionStorage.removeItem("pending_domain");
          sessionStorage.removeItem(ONBOARDING_LOCK_KEY);
          setStatus("Redirecting to dashboard…");
          setExistingSiteId(site.id);
          return;
        }

        setStatus("Researching your domain and generating prompts…");
        const agentRes = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, siteId: site.id, mode: "initial" })
        });
        if (!agentRes.ok) {
          const data = await agentRes.json().catch(() => null);
          throw new Error(data?.error ?? "Failed to generate prompts");
        }

        sessionStorage.removeItem("pending_domain");
        sessionStorage.removeItem(ONBOARDING_LOCK_KEY);
        setStatus("Almost done — testing your prompts…");

        router.push(`/dashboard?siteId=${site.id}&new=true`);
      } catch (error) {
        sessionStorage.removeItem(ONBOARDING_LOCK_KEY);
        const message =
          error instanceof Error ? error.message : "Something went wrong.";

        if (createdSiteId) {
          setStatus("Prompt generation failed. Redirecting to dashboard…");
          setTimeout(
            () => router.push(`/dashboard?siteId=${createdSiteId}`),
            2000
          );
          return;
        }

        setStatus(message);
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

      <Dialog
        open={Boolean(existingSiteId)}
        onOpenChange={(open) => {
          if (!open && existingSiteId) {
            router.push(`/dashboard?siteId=${existingSiteId}`);
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>You already have created this website</DialogTitle>
            <DialogDescription>
              View your website in the dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                if (existingSiteId) {
                  router.push(`/dashboard?siteId=${existingSiteId}`);
                }
              }}
            >
              Go to dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UpgradeRequiredDialog
        open={showUpgradeDialog}
        onOpenChange={(open) => {
          setShowUpgradeDialog(open);
          if (!open) {
            router.push("/dashboard");
          }
        }}
        title="Premium required for another website"
        description="Free accounts can track one website. Go back to your dashboard or upgrade to premium to add a second site."
      />
    </div>
  );
}
