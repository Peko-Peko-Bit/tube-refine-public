-- Rate limiting for the cost-bearing routes (fixed window, counted per key per
-- bucket). Accessed exclusively via check_rate_limit() with the service_role
-- key; RLS is enabled with no policies so anon/authenticated have no access.
--
-- `key` is free-form text rather than a user id so one bucket can be counted
-- per user *or* across every guest at once (the sentinel 'guest:all'). The
-- shared guest bucket is what actually caps spend: anonymous accounts are free
-- and unlimited, so a per-guest limit on its own resets the moment someone
-- clears their cookies.
--
-- `expires_at` is stored per row instead of deriving expiry from window_start,
-- because buckets here use different window lengths (1h for the owner, 24h for
-- guests). Comparing window_start against the caller's current window would
-- delete live 24h rows whenever a 1h check ran.

create table if not exists public.rate_limits (
  key          text        not null,
  bucket       text        not null,
  window_start timestamptz not null,
  expires_at   timestamptz not null,
  count        integer     not null default 0,
  primary key (key, bucket, window_start)
);

alter table public.rate_limits enable row level security;

create or replace function public.check_rate_limit(
  p_key            text,
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_expires_at   timestamptz;
  v_count        integer;
  v_retry_after  integer;
begin
  -- Fixed window aligned to epoch so all instances agree on the boundary
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_expires_at := v_window_start + make_interval(secs => p_window_seconds);

  -- Drop expired rows so the table stays small without a separate cron job.
  -- Global on purpose: scoping it to the caller would leave rows behind
  -- forever for guests that never come back.
  delete from public.rate_limits where expires_at <= now();

  insert into public.rate_limits (key, bucket, window_start, expires_at, count)
  values (p_key, p_bucket, v_window_start, v_expires_at, 1)
  on conflict (key, bucket, window_start)
  do update set count = rate_limits.count + 1
  returning count into v_count;

  v_retry_after := ceil(extract(epoch from (v_expires_at - now())));

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'retry_after', greatest(v_retry_after, 1)
  );
end;
$$;

-- service_role only: revoke from everyone else
revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
