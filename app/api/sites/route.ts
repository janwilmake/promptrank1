import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { adminDb } from "@/lib/db";
import { logError, logInfo } from "@/lib/log";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await adminDb
    .from("sites")
    .select("id, domain, created_at, last_checked, initial_prompt_generation_status, initial_prompt_generation_error")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { domain } = await req.json();
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  // Normalize domain
  const normalizedDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

  const { data: existingSite, error: existingSiteLookupError } = await adminDb
    .from("sites")
    .select("id, domain, created_at, last_checked, initial_prompt_generation_status, initial_prompt_generation_error")
    .eq("user_id", session.user.id)
    .eq("domain", normalizedDomain)
    .single();

  if (!existingSiteLookupError && existingSite) {
    logInfo("onboarding", "Reusing existing site", {
      siteId: existingSite.id,
      domain: existingSite.domain,
      userId: session.user.id,
      userEmail: session.user.email,
    });
    return NextResponse.json({ ...existingSite, existing: true });
  }

  const [{ count: existingSiteCount }, { data: subscription }] = await Promise.all([
    adminDb
      .from("sites")
      .select("*", { count: "exact", head: true })
      .eq("user_id", session.user.id),
    adminDb
      .from("subscriptions")
      .select("status")
      .eq("user_id", session.user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const isPaid = subscription?.status === "active";

  if (!isPaid && (existingSiteCount ?? 0) >= 1) {
    return NextResponse.json(
      {
        error: "Free accounts can only add one website. Upgrade to premium to track more sites.",
        code: "free_plan_site_limit",
      },
      { status: 402 }
    );
  }

  const { data, error } = await adminDb
    .from("sites")
    .insert({ user_id: session.user.id, domain: normalizedDomain })
    .select("id, domain, created_at, last_checked, initial_prompt_generation_status, initial_prompt_generation_error")
    .single();

  if (error) {
    logError("onboarding", "Failed to create site", {
      domain: normalizedDomain,
      userId: session.user.id,
      userEmail: session.user.email,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logInfo("onboarding", "Created site", {
    siteId: data.id,
    domain: data.domain,
    userId: session.user.id,
    userEmail: session.user.email,
  });

  return NextResponse.json({ ...data, existing: false }, { status: 201 });
}
