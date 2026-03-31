import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia"
    });
  }
  return _stripe;
}

// Convenience alias used in route handlers
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as unknown as Record<string, unknown>)[prop as string];
  }
});

export const PRICE_PER_SITE_MONTHLY = 3500; // $35 in cents

export async function getOrCreateCustomer(
  userId: string,
  email: string
): Promise<string> {
  const existing = await stripe.customers.search({
    query: `metadata['userId']:'${userId}'`,
    limit: 1
  });

  if (existing.data.length > 0) {
    return existing.data[0].id;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { userId }
  });

  return customer.id;
}

export async function createCheckoutSession(
  customerId: string,
  siteCount: number,
  returnUrl: string
) {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    allow_promotion_codes: true,
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID!,
        quantity: siteCount
      }
    ],
    success_url: `${returnUrl}?checkout=success`,
    cancel_url: `${returnUrl}?checkout=cancelled`,
    metadata: { siteCount: String(siteCount) }
  });
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });
}
