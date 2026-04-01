This is promptrank1.

To run this:

1. Copy `.env.example` → `.env.local` and fill in all keys.
2. Run the SQL migration in your Supabase project
3. Create a Stripe product at $35/seat and set STRIPE_PRICE_ID
4. Set up Stripe webhook pointing to `/api/webhooks/stripe`
5. run NextJS: `npm run dev`
6. run Inngest: `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`
7. run Stripe webhook listener: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

Stack:

- _Next.js_ for React + serverless API
- _Supabase_ for postgres
- _Inngest_ for cronjobs and queue
- _Resend_ for email
- _Stripe_ for payments
