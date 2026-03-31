import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb } from "@/lib/db";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      const siteCount = parseInt(session.metadata?.siteCount ?? "1", 10);

      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) break;
      const userId = (customer as Stripe.Customer).metadata?.userId;
      if (!userId) break;

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      // billing_cycle_anchor is the next renewal timestamp in the new Stripe API
      const nextRenewal = new Date(sub.billing_cycle_anchor * 1000).toISOString();

      await adminDb.from("subscriptions").upsert({
        user_id: userId,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        status: sub.status,
        site_count: siteCount,
        current_period_end: nextRenewal,
      }, { onConflict: "user_id" });

      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) break;
      const userId = (customer as Stripe.Customer).metadata?.userId;
      if (!userId) break;

      const nextRenewal = new Date(sub.billing_cycle_anchor * 1000).toISOString();

      await adminDb
        .from("subscriptions")
        .update({
          status: sub.status,
          site_count: sub.items.data[0]?.quantity ?? 1,
          current_period_end: nextRenewal,
        })
        .eq("stripe_subscription_id", sub.id);

      break;
    }
  }

  return NextResponse.json({ received: true });
}
