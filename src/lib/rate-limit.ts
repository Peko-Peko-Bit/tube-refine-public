/**
 * Rate limiting for the routes that cost money (OpenRouter, Google Translate,
 * YouTube Data API), backed by the check_rate_limit() SQL function in
 * supabase/migrations/20260722000000_rate_limits.sql.
 *
 * Guests and the owner are limited separately:
 *
 *   - Guests get a small per-account allowance *and* share one daily budget.
 *     The shared budget is the part that actually caps spend — anonymous
 *     accounts are free and unlimited, so a per-account limit alone resets
 *     whenever someone clears their cookies.
 *   - Signed-in (allowlisted) users get a generous hourly allowance. Only
 *     approved addresses can sign in, so this is a runaway-loop guard rather
 *     than an abuse defence, and it never consults the guest budget — guests
 *     hitting their ceiling can never lock the owner out.
 */

import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export type RateLimitBucket = "save" | "summarize" | "retry" | "refetch";

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86400;

/** Per anonymous account, per 24h. */
const GUEST_PER_USER: Record<RateLimitBucket, number> = {
  save: 10,
  summarize: 3, // heaviest call: the model ingests the video itself
  retry: 3,
  refetch: 10,
};

/** Shared by all guests, per 24h. Buckets left out are not globally capped. */
const GUEST_SHARED: Partial<Record<RateLimitBucket, number>> = {
  save: 100,
  summarize: 50,
};

/** Per signed-in user, per hour. */
const OWNER_PER_USER: Record<RateLimitBucket, number> = {
  save: 60,
  summarize: 30,
  retry: 30,
  refetch: 60,
};

const GUEST_SHARED_KEY = "guest:all";

const MESSAGES = {
  guestUser: "You have reached the guest limit for today. Please try again tomorrow.",
  guestShared:
    "The shared guest demo budget for today is used up. Please try again tomorrow.",
  owner: "Too many requests. Please try again shortly.",
};

interface CheckResult {
  allowed: boolean;
  retryAfter: number;
}

async function check(
  key: string,
  bucket: RateLimitBucket,
  limit: number,
  windowSeconds: number
): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fail open: a broken limiter must not take the app down with it.
  if (!url || !serviceKey) {
    console.error("[rate-limit] SUPABASE_SERVICE_ROLE_KEY not set; rate limiting disabled");
    return { allowed: true, retryAfter: 0 };
  }

  const supabase = createClient(url, serviceKey);
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("[rate-limit] check_rate_limit RPC failed:", error.message);
    return { allowed: true, retryAfter: 0 };
  }

  return {
    allowed: data.allowed === true,
    retryAfter: typeof data.retry_after === "number" ? data.retry_after : 0,
  };
}

function tooManyRequests(message: string, retryAfter: number): Response {
  return new Response(
    // Clients read `error` to decide what to show the user.
    JSON.stringify({ error: message }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    }
  );
}

/**
 * Returns a ready-to-return 429 when the caller is over their limit, or null
 * when the request may proceed. Call it as late as possible — after auth,
 * validation, and any cached-result short circuit — so rejected or free
 * requests do not consume the allowance.
 */
export async function enforceRateLimit(
  user: User,
  bucket: RateLimitBucket
): Promise<Response | null> {
  if (user.is_anonymous) {
    const perUser = await check(user.id, bucket, GUEST_PER_USER[bucket], DAY_SECONDS);
    if (!perUser.allowed) {
      return tooManyRequests(MESSAGES.guestUser, perUser.retryAfter);
    }

    const sharedLimit = GUEST_SHARED[bucket];
    if (sharedLimit !== undefined) {
      const shared = await check(GUEST_SHARED_KEY, bucket, sharedLimit, DAY_SECONDS);
      if (!shared.allowed) {
        return tooManyRequests(MESSAGES.guestShared, shared.retryAfter);
      }
    }

    return null;
  }

  const owner = await check(user.id, bucket, OWNER_PER_USER[bucket], HOUR_SECONDS);
  return owner.allowed ? null : tooManyRequests(MESSAGES.owner, owner.retryAfter);
}
