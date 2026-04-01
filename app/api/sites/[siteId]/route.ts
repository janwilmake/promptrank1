import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { adminDb } from "@/lib/db";
import { logError, logInfo } from "@/lib/log";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;

  const { data: deletedSite, error } = await adminDb
    .from("sites")
    .delete()
    .eq("id", siteId)
    .eq("user_id", session.user.id)
    .select("id, domain")
    .maybeSingle();

  if (error) {
    logError("sites", "Failed to delete site", {
      siteId,
      userId: session.user.id,
      userEmail: session.user.email,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!deletedSite) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  logInfo("sites", "Deleted site", {
    siteId: deletedSite.id,
    domain: deletedSite.domain,
    userId: session.user.id,
    userEmail: session.user.email,
  });

  return NextResponse.json({ deleted: true, site: deletedSite });
}
