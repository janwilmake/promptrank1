alter table if exists public."user" enable row level security;
alter table if exists public.session enable row level security;
alter table if exists public.account enable row level security;
alter table if exists public.verification enable row level security;

do $$
begin
  if to_regclass('public."user"') is not null then
    execute 'revoke all on table public."user" from anon, authenticated';
  end if;

  if to_regclass('public.session') is not null then
    execute 'revoke all on table public.session from anon, authenticated';
  end if;

  if to_regclass('public.account') is not null then
    execute 'revoke all on table public.account from anon, authenticated';
  end if;

  if to_regclass('public.verification') is not null then
    execute 'revoke all on table public.verification from anon, authenticated';
  end if;
end $$;
