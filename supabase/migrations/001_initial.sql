-- Sites
create table sites (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  domain text not null,
  created_at timestamptz not null default now(),
  last_checked timestamptz,
  unique (user_id, domain)
);

create index sites_user_id_idx on sites (user_id);

-- Subscriptions
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  status text not null,
  site_count integer not null default 1,
  current_period_end timestamptz not null,
  created_at timestamptz not null default now()
);

-- Prompts
create table prompts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index prompts_site_id_idx on prompts (site_id);

-- Prompt results
create table prompt_results (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts (id) on delete cascade,
  provider text not null,
  response text not null,
  mentions_domain boolean not null default false,
  rank integer,
  checked_at timestamptz not null default now()
);

create index prompt_results_prompt_id_idx on prompt_results (prompt_id);
create index prompt_results_checked_at_idx on prompt_results (checked_at desc);

-- Function: get paid sites not checked in 7+ days (for cron)
create or replace function get_stale_paid_sites(cutoff timestamptz)
returns table (site_id uuid, domain text, email text)
language sql
stable
as $$
  select
    s.id as site_id,
    s.domain,
    u.email
  from sites s
  join subscriptions sub on sub.user_id = s.user_id
  join auth.users u on u.id::text = s.user_id
  where sub.status = 'active'
    and (s.last_checked is null or s.last_checked < cutoff)
$$;

-- RLS: enable on all tables, restrict to service_role for now
-- (better-auth handles its own auth tables)
alter table sites enable row level security;
alter table subscriptions enable row level security;
alter table prompts enable row level security;
alter table prompt_results enable row level security;

-- Service role bypass (used by the API via SUPABASE_SERVICE_ROLE_KEY)
create policy "service role full access" on sites for all using (true);
create policy "service role full access" on subscriptions for all using (true);
create policy "service role full access" on prompts for all using (true);
create policy "service role full access" on prompt_results for all using (true);
