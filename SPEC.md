Name: promptrank1(.com)

Flow:

- User lands on this website with good SEO optimisation
- Landingpage has a form to fill in domain
- After filling in, google login (using better-auth) is requested
- After successful google login, ai agent researches the domain and comes up with target audience and what they may be searching for (uses parallel.ai search tool and tests a little to find the right depth of niche). the result of the agent is a set of prompts that a user could try in any llm app
- All prompts are tested using openrouter and after the results are in, they are shown in the dashboard. The user should also receive an email about the results.
- The dashboard allows adding more prompts as well as generating prompt suggestions (which runs the agent again)
- There is a paywall shown in the dashboard that offers keeping track of these prompts and the competition. Cost: $35 per month per site. The user can select the amount of websites.
- For all paid users we keep track of all prompts weekly using an hourly cronjob. Each website with `last_checked` longer than a week ago, is to be put into a queue.
- A single queue message handles all prompts for all providers for 1 website.

Stack:

- Frontend: Next.js
- Database: Supabase (Postgres)
- Backend: Next.js
  - rest api:
    - adding/removing prompts
    - billing changes
  - cronjobs + queues: inngest
- Payments: Stripe
