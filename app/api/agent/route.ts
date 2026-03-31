import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { researchDomainAndGeneratePrompts } from "@/lib/parallel";
import { adminDb } from "@/lib/db";
import { inngest } from "@/inngest/client";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domain, siteId } = await req.json();
  if (!domain || !siteId) {
    return NextResponse.json({ error: "domain and siteId required" }, { status: 400 });
  }

  // Verify site belongs to user
  const { data: site, error: siteError } = await adminDb
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", session.user.id)
    .single();

  if (siteError || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Run research agent
  const research = await researchDomainAndGeneratePrompts(domain);

  // Persist generated prompts
  const { data: prompts, error: insertError } = await adminDb
    .from("prompts")
    .insert(research.prompts.map((text) => ({ site_id: siteId, text })))
    .select("id, text");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Kick off prompt testing via Inngest
  await inngest.send({
    name: "site/check",
    data: {
      siteId,
      domain,
      userEmail: session.user.email,
    },
  });

  return NextResponse.json({
    targetAudience: research.targetAudience,
    niche: research.niche,
    prompts,
  });
}
