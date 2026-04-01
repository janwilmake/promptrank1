"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteCount?: number;
  title?: string;
  description?: string;
}

export function UpgradeRequiredDialog({
  open,
  onOpenChange,
  siteCount = 2,
  title = "Upgrade required",
  description = "Free accounts can track one website. Upgrade to premium to add more websites and generate more suggestions.",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);

    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", siteCount }),
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Go to dashboard
          </Button>
          <Button onClick={handleUpgrade} disabled={loading}>
            {loading ? "Redirecting…" : "Purchase premium"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
