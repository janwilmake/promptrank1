"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";

export function HomeHeaderAction() {
  const { data: session, isPending } = useSession();

  if (isPending || !session) {
    return null;
  }

  return (
    <Button variant="outline" asChild>
      <Link href="/dashboard">Dashboard</Link>
    </Button>
  );
}
