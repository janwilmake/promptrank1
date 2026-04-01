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

  const { data, error } = await adminDb
    .from("sites")
    .insert({ user_id: session.user.id, domain: normalizedDomain })
    .select("id, domain, created_at, last_checked, initial_prompt_generation_status, initial_prompt_generation_error")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existingSite, error: existingSiteError } = await adminDb
        .from("sites")
        .select("id, domain, created_at, last_checked, initial_prompt_generation_status, initial_prompt_generation_error")
        .eq("user_id", session.user.id)
        .eq("domain", normalizedDomain)
        .single();

      if (!existingSiteError && existingSite) {
        logInfo("onboarding", "Reusing existing site", {
          siteId: existingSite.id,
          domain: existingSite.domain,
          userId: session.user.id,
          userEmail: session.user.email,
        });
        return NextResponse.json({ ...existingSite, existing: true });
      }
    }

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
