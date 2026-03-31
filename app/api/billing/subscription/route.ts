import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { adminDb } from "@/lib/db";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json(null, { status: 401 });

  const { data } = await adminDb
    .from("subscriptions")
    .select("status, site_count, current_period_end")
    .eq("user_id", session.user.id)
    .single();

  return NextResponse.json(data ?? null);
}
