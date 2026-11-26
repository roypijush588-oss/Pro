import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { ApiRequest, ApiResponse } from './httpUtils.ts';
import { getClientIp, sendJson, sendText } from './httpUtils.ts';

export type RateLimitTier = 'gemini' | 'gemini-heavy' | 'pdf';

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
  windowLabel: '1 m' | '1 h';
}

export const RATE_LIMIT_TIERS: Record<RateLimitTier, { burst: RateLimitRule; sustained: RateLimitRule }> = {
  gemini: {
    burst: { limit: 20, windowSeconds: 60, windowLabel: '1 m' },
    sustained: { limit: 120, windowSeconds: 3600, windowLabel: '1 h' },
  },
  'gemini-heavy': {
    burst: { limit: 10, windowSeconds: 60, windowLabel: '1 m' },
    sustained: { limit: 60, windowSeconds: 3600, windowLabel: '1 h' },
  },
  pdf: {
    burst: { limit: 6, windowSeconds: 60, windowLabel: '1 m' },
    sustained: { limit: 30, windowSeconds: 3600, windowLabel: '1 h' },
  },
};

export interface RateLimitCheckResult {
  allowed: boolean;
  statusCode: number;
  limit: number;
  remaining: number;
  resetUnixSeconds: number;
  retryAfterSeconds?: number;
  error?: string;
  backend: 'upstash' | 'local-dev' | 'unavailable';
}

export interface DistributedLimiterBackend {
  limit(
    key: string,
    tier: RateLimitTier,
    windowKind: 'burst' | 'sustained'
  ): Promise<{ success: boolean; limit: number; remaining: number; reset: number }>;
}

const UPSTASH_TIMEOUT_MS = 3_000;
const MAX_LOCAL_DEV_KEYS = 5_000;
let warnedLocalDevFallback = false;

function isProductionOrHostedRuntime(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.VERCEL ||
      env.VERCEL_ENV ||
      env.AWS_LAMBDA_FUNCTION_NAME ||
      env.NODE_ENV === 'production' ||
      env.REQUIRE_DISTRIBUTED_RATE_LIMIT === 'true'
  );
}

function isValidUpstashUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Rate limit backend timed out'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function createUpstashBackend(url: string, token: string): DistributedLimiterBackend {
  const redis = new Redis({
    url,
    token,
    retry: false,
  });

  const limiters = {
    gemini: {
      burst: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_TIERS.gemini.burst.limit, RATE_LIMIT_TIERS.gemini.burst.windowLabel),
        prefix: 'pro:rl:gemini:burst',
      }),
      sustained: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_TIERS.gemini.sustained.limit, RATE_LIMIT_TIERS.gemini.sustained.windowLabel),
        prefix: 'pro:rl:gemini:hour',
      }),
    },
    'gemini-heavy': {
      burst: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_TIERS['gemini-heavy'].burst.limit, RATE_LIMIT_TIERS['gemini-heavy'].burst.windowLabel),
        prefix: 'pro:rl:gemini-heavy:burst',
      }),
      sustained: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_TIERS['gemini-heavy'].sustained.limit, RATE_LIMIT_TIERS['gemini-heavy'].sustained.windowLabel),
        prefix: 'pro:rl:gemini-heavy:hour',
      }),
    },
    pdf: {
      burst: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_TIERS.pdf.burst.limit, RATE_LIMIT_TIERS.pdf.burst.windowLabel),
        prefix: 'pro:rl:pdf:burst',
      }),
      sustained: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_TIERS.pdf.sustained.limit, RATE_LIMIT_TIERS.pdf.sustained.windowLabel),
        prefix: 'pro:rl:pdf:hour',
      }),
    },
  };

  return {
    async limit(key: string, tier: RateLimitTier, windowKind: 'burst' | 'sustained') {
      const limiter = limiters[tier][windowKind];
      const result = await withTimeout(limiter.limit(key), UPSTASH_TIMEOUT_MS);
      return {
        success: Boolean(result.success),
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    },
  };
}

class LocalDevSlidingWindowLimiter {
  private readonly buckets = new Map<string, number[]>();

  check(key: string, rule: RateLimitRule, nowMs: number): {
    success: boolean;
    limit: number;
    remaining: number;
    resetMs: number;
  } {
    const windowMs = rule.windowSeconds * 1000;
    const cutoff = nowMs - windowMs;
    const timestamps = (this.buckets.get(key) ?? []).filter((ts) => ts > cutoff);

    if (timestamps.length >= rule.limit) {
      const oldest = timestamps[0] ?? nowMs;
      this.buckets.set(key, timestamps);
      return {
        success: false,
        limit: rule.limit,
        remaining: 0,
        resetMs: oldest + windowMs,
      };
    }

    if (!this.buckets.has(key) && this.buckets.size >= MAX_LOCAL_DEV_KEYS) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey) this.buckets.delete(oldestKey);
    }

    timestamps.push(nowMs);
    this.buckets.delete(key);
    this.buckets.set(key, timestamps);

    const oldest = timestamps[0] ?? nowMs;
    return {
      success: true,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - timestamps.length),
      resetMs: oldest + windowMs,
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}

export interface RateLimiterOptions {
  env?: Record<string, string | undefined>;
  distributedBackend?: DistributedLimiterBackend;
  now?: () => number;
}

export function createRateLimiter(options: RateLimiterOptions = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => Date.now());
  const localDevLimiter = new LocalDevSlidingWindowLimiter();

  let cachedBackend: DistributedLimiterBackend | undefined = options.distributedBackend;
  let cachedUrl = '';
  let cachedToken = '';

  function resolveDistributedBackend(): {
    configured: boolean;
    valid: boolean;
    backend?: DistributedLimiterBackend;
  } {
    if (options.distributedBackend) {
      return { configured: true, valid: true, backend: options.distributedBackend };
    }

    const url = env.UPSTASH_REDIS_REST_URL?.trim() ?? '';
    const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? '';

    if (!url && !token) {
      return { configured: false, valid: false };
    }

    if (!url || !token || !isValidUpstashUrl(url)) {
      return { configured: true, valid: false };
    }

    if (!cachedBackend || cachedUrl !== url || cachedToken !== token) {
      cachedBackend = createUpstashBackend(url, token);
      cachedUrl = url;
      cachedToken = token;
    }

    return { configured: true, valid: true, backend: cachedBackend };
  }

  async function checkIpLimit(ip: string, tier: RateLimitTier): Promise<RateLimitCheckResult> {
    const cleanIp = ip.trim() || 'unknown';
    const currentNow = now();
    const rules = RATE_LIMIT_TIERS[tier];
    const resolved = resolveDistributedBackend();

    if (resolved.configured && !resolved.valid) {
      console.error('[RateLimit] Invalid Upstash Redis configuration. Failing closed.');
      return {
        allowed: false,
        statusCode: 503,
        limit: rules.burst.limit,
        remaining: 0,
        resetUnixSeconds: Math.ceil((currentNow + 60_000) / 1000),
        retryAfterSeconds: 60,
        error: 'Service temporarily unavailable. Rate limiting configuration is invalid.',
        backend: 'unavailable',
      };
    }

    if (resolved.configured && resolved.backend) {
      try {
        const [burstResult, sustainedResult] = await Promise.all([
          resolved.backend.limit(cleanIp, tier, 'burst'),
          resolved.backend.limit(cleanIp, tier, 'sustained'),
        ]);

        if (!burstResult.success || !sustainedResult.success) {
          const violated = !burstResult.success ? burstResult : sustainedResult;
          const retryAfterSeconds = Math.max(1, Math.ceil((violated.reset - currentNow) / 1000));
          return {
            allowed: false,
            statusCode: 429,
            limit: violated.limit,
            remaining: 0,
            resetUnixSeconds: Math.ceil(violated.reset / 1000),
            retryAfterSeconds,
            error: `Too many requests from this IP. Please retry in ${retryAfterSeconds} seconds.`,
            backend: 'upstash',
          };
        }

        const tighter =
          burstResult.remaining <= sustainedResult.remaining ? burstResult : sustainedResult;
        return {
          allowed: true,
          statusCode: 200,
          limit: tighter.limit,
          remaining: Math.max(0, tighter.remaining),
          resetUnixSeconds: Math.ceil(tighter.reset / 1000),
          backend: 'upstash',
        };
      } catch (error) {
        console.error(
          '[RateLimit] Distributed Upstash limiter unavailable; failing closed:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        return {
          allowed: false,
          statusCode: 503,
          limit: rules.burst.limit,
          remaining: 0,
          resetUnixSeconds: Math.ceil((currentNow + 30_000) / 1000),
          retryAfterSeconds: 30,
          error: 'Service temporarily unavailable. Rate limiting service is unavailable.',
          backend: 'unavailable',
        };
      }
    }

    // Upstash is not configured at all.
    // In production/Vercel/hosted runtimes, NEVER fall back to local memory or unrestricted access.
    if (isProductionOrHostedRuntime(env)) {
      console.error(
        '[RateLimit] Distributed rate limiter (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) is not configured in production. Failing closed.'
      );
      return {
        allowed: false,
        statusCode: 503,
        limit: rules.burst.limit,
        remaining: 0,
        resetUnixSeconds: Math.ceil((currentNow + 60_000) / 1000),
        retryAfterSeconds: 60,
        error: 'Service temporarily unavailable. Distributed rate limiting is not configured.',
        backend: 'unavailable',
      };
    }

    // Local non-production development only: enforce strict bounded per-IP in-memory limits (never unrestricted).
    if (!warnedLocalDevFallback) {
      warnedLocalDevFallback = true;
      console.warn(
        '[RateLimit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set; using strict local-only in-memory rate limits in development.'
      );
    }

    const burstCheck = localDevLimiter.check(`dev:${tier}:burst:${cleanIp}`, rules.burst, currentNow);
    const sustainedCheck = burstCheck.success
      ? localDevLimiter.check(`dev:${tier}:hour:${cleanIp}`, rules.sustained, currentNow)
      : null;

    if (!burstCheck.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((burstCheck.resetMs - currentNow) / 1000));
      return {
        allowed: false,
        statusCode: 429,
        limit: burstCheck.limit,
        remaining: 0,
        resetUnixSeconds: Math.ceil(burstCheck.resetMs / 1000),
        retryAfterSeconds,
        error: `Too many requests from this IP. Please retry in ${retryAfterSeconds} seconds.`,
        backend: 'local-dev',
      };
    }

    if (sustainedCheck && !sustainedCheck.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((sustainedCheck.resetMs - currentNow) / 1000));
      return {
        allowed: false,
        statusCode: 429,
        limit: sustainedCheck.limit,
        remaining: 0,
        resetUnixSeconds: Math.ceil(sustainedCheck.resetMs / 1000),
        retryAfterSeconds,
        error: `Hourly request limit reached for this IP. Please retry in ${retryAfterSeconds} seconds.`,
        backend: 'local-dev',
      };
    }

    const activeCheck =
      sustainedCheck && sustainedCheck.remaining < burstCheck.remaining ? sustainedCheck : burstCheck;
    return {
      allowed: true,
      statusCode: 200,
      limit: activeCheck.limit,
      remaining: activeCheck.remaining,
      resetUnixSeconds: Math.ceil(activeCheck.resetMs / 1000),
      backend: 'local-dev',
    };
  }

  return {
    checkIpLimit,
    resetLocalDevLimiter() {
      localDevLimiter.clear();
    },
  };
}

const defaultRateLimiter = createRateLimiter();

export async function enforceRateLimit(
  req: ApiRequest,
  res: ApiResponse,
  tier: RateLimitTier,
  format: 'json' | 'text' = 'json',
  limiter = defaultRateLimiter
): Promise<boolean> {
  const clientIp = getClientIp(req);
  const result = await limiter.checkIpLimit(clientIp, tier);

  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(result.resetUnixSeconds));

  if (result.allowed) {
    return true;
  }

  if (result.retryAfterSeconds) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
  }

  const message = result.error || 'Too many requests. Please try again later.';
  if (format === 'text') {
    sendText(res, result.statusCode, message);
  } else {
    sendJson(res, result.statusCode, {
      error: message,
      code: result.statusCode,
      ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    });
  }
  return false;
}
