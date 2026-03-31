Next steps to get it running:

1. Copy .env.example → .env.local and fill in all keys
2. Run the SQL migration in your Supabase project
3. Create a Stripe product at $35/seat and set STRIPE_PRICE_ID
4. Set up Stripe webhook pointing to /api/webhooks/stripe
5. npm run dev + npx inngest-cli@latest dev for local Inngest
6. run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
