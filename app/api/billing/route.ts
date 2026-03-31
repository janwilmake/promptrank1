import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createCheckoutSession,
  createBillingPortalSession,
  getOrCreateCustomer,
} from "@/lib/stripe";
import { adminDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, siteCount } = await req.json();
  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

  const customerId = await getOrCreateCustomer(
    session.user.id,
    session.user.email
  );

  if (action === "checkout") {
    const count = Math.max(1, Math.min(100, parseInt(siteCount ?? "1", 10)));
    const checkoutSession = await createCheckoutSession(customerId, count, returnUrl);
    return NextResponse.json({ url: checkoutSession.url });
  }

  if (action === "portal") {
    // Check user has an active subscription
    const { data: sub } = await adminDb
      .from("subscriptions")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("status", "active")
      .single();

    if (!sub) {
      return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    const portalSession = await createBillingPortalSession(customerId, returnUrl);
    return NextResponse.json({ url: portalSession.url });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
