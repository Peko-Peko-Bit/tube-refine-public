-- Deletes guest (anonymous) accounts once they age out, along with everything
-- they created.
--
-- The whole job is one DELETE: bookmarks.user_id references auth.users with
-- ON DELETE CASCADE, so removing the account takes the bookmarks with it.
-- rate_limits is keyed by free-form text with no foreign key, so it is cleared
-- explicitly first.
--
-- Runs entirely in the database — pg_cron calls this hourly. No edge function,
-- no shared secret, no pg_net: there is nothing here the database cannot do on
-- its own, and every extra hop is a thing that can silently stop working.
--
-- Requires the pg_cron extension (Dashboard > Database > Extensions).

create or replace function public.cleanup_guest_data(
  -- Seconds rather than an interval so the function can be called over
  -- PostgREST without ambiguous type coercion (used when verifying).
  p_older_than_seconds integer default 86400
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff  timestamptz := now() - make_interval(secs => p_older_than_seconds);
  v_deleted integer;
begin
  delete from public.rate_limits rl
  using auth.users u
  where rl.key = u.id::text
    and u.is_anonymous
    and u.created_at < v_cutoff;

  delete from auth.users u
  where u.is_anonymous
    and u.created_at < v_cutoff;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- service_role keeps execute access so the cleanup can be triggered and
-- verified over RPC; everyone else is locked out.
revoke all on function public.cleanup_guest_data(integer) from public, anon, authenticated;

select cron.schedule(
  'cleanup-guest-data-hourly',
  '0 * * * *',
  $$select public.cleanup_guest_data()$$
);
