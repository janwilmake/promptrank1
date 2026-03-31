import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { adminDb } from "@/lib/db";
import { inngest } from "@/inngest/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId } = await params;

  // Verify ownership
  const { data: site } = await adminDb
    .from("sites")
    .select("id, domain")
    .eq("id", siteId)
    .eq("user_id", session.user.id)
    .single();

  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await adminDb
    .from("prompts")
    .select(`
      id, text, created_at,
      prompt_results (
        id, provider, mentions_domain, rank, checked_at
      )
    `)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const { data: site } = await adminDb
    .from("sites")
    .select("id, domain")
    .eq("id", siteId)
    .eq("user_id", session.user.id)
    .single();

  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: prompt, error } = await adminDb
    .from("prompts")
    .insert({ site_id: siteId, text })
    .select("id, text, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Immediately test the new prompt
  await inngest.send({
    name: "site/check",
    data: {
      siteId,
      domain: site.domain,
      userEmail: session.user.email,
    },
  });

  return NextResponse.json(prompt, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const { promptId } = await req.json();

  // Verify site ownership
  const { data: site } = await adminDb
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", session.user.id)
    .single();

  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await adminDb
    .from("prompts")
    .delete()
    .eq("id", promptId)
    .eq("site_id", siteId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
