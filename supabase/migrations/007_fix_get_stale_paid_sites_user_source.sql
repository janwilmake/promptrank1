create or replace function get_stale_paid_sites(cutoff timestamptz)
returns table (site_id uuid, domain text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id as site_id,
    s.domain,
    u.email
  from sites s
  join subscriptions sub on sub.user_id = s.user_id
  join public."user" u on u.id = s.user_id
  where sub.status = 'active'
    and (s.last_checked is null or s.last_checked < cutoff)
$$;

grant execute on function get_stale_paid_sites(timestamptz) to anon, authenticated, service_role;
