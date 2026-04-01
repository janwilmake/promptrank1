create table site_check_runs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  domain text not null,
  user_email text not null,
  total_prompts integer not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  email_sent_at timestamptz
);

create index site_check_runs_site_id_created_at_idx
  on site_check_runs (site_id, created_at desc);

create table site_check_run_prompts (
  site_check_run_id uuid not null references site_check_runs (id) on delete cascade,
  prompt_id uuid not null references prompts (id) on delete cascade,
  prompt_text text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (site_check_run_id, prompt_id)
);

create index site_check_run_prompts_run_completed_idx
  on site_check_run_prompts (site_check_run_id, completed_at);

alter table prompt_results
  add column check_run_id uuid references site_check_runs (id) on delete cascade;

create unique index prompt_results_prompt_provider_check_run_idx
  on prompt_results (prompt_id, provider, check_run_id);

alter table site_check_runs enable row level security;
alter table site_check_run_prompts enable row level security;

create policy "service role full access" on site_check_runs for all using (true);
create policy "service role full access" on site_check_run_prompts for all using (true);
