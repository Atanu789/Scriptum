import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { AuthenticatedRequest } from '../types';

/**
 * General API rate limiter – 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again after 15 minutes.',
  },
});

/**
 * Auth endpoints – stricter: 10 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

/**
 * AI analysis endpoints – expensive: 20 requests per hour per IP
 */
export const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, _res, next) => {
    const r = req as AuthenticatedRequest;
    r.aiLimited = true;
    r.aiLimitReason = 'AI analysis rate limit reached. Using fallback mode.';
    next();
  },
});

/**
 * Upload endpoint – 10 uploads per 30 minutes per IP
 */
export const uploadLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Upload limit reached. Please try again after 30 minutes.',
  },
});

/**
 * Deepgram temp-key endpoint – 10 keys per user per hour
 * Prevents abuse of our primary Deepgram API key.
 */
export const deepgramTokenLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Deepgram token rate limit reached. Please try again after 1 hour.',
  },
});

// ─── Per-User Gemini analysis rate limiter ─────────────────────────────────
// Tracks each authenticated user by userId (not by IP).
// Limit: 10 Gemini analysis calls per user per hour.
// Uses in-memory Map with aggressive cleanup to prevent memory leaks.

const USER_WINDOW_MS   = 60 * 60 * 1000; // 1 hour
const USER_MAX_CALLS   = 10;             // max Gemini calls per hour per user
const MAX_BUCKET_SIZE  = 10000;          // Prevent unbounded growth

interface UserBucket { count: number; resetAt: number; }
const _userBuckets = new Map<string, UserBucket>();

// Aggressive cleanup: prune stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  const toDelete: string[] = [];
  
  for (const [id, b] of _userBuckets) {
    if (now >= b.resetAt) toDelete.push(id);
  }
  
  toDelete.forEach(id => _userBuckets.delete(id));
  
  // Emergency cleanup if map grows too large
  if (_userBuckets.size > MAX_BUCKET_SIZE) {
    console.warn(`[RateLimit] Bucket size exceeded ${MAX_BUCKET_SIZE}, clearing oldest entries`);
    const entries = Array.from(_userBuckets.entries())
      .sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toRemove = entries.slice(0, Math.floor(MAX_BUCKET_SIZE / 2));
    toRemove.forEach(([id]) => _userBuckets.delete(id));
  }
}, 5 * 60 * 1000);

export function checkUserAnalysisLimit(
  userId: string
): { allowed: boolean; retryAfterMs: number } {
  const now    = Date.now();
  const bucket = _userBuckets.get(userId);

  if (!bucket || now >= bucket.resetAt) {
    _userBuckets.set(userId, { count: 1, resetAt: now + USER_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= USER_MAX_CALLS) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count++;
  return { allowed: true, retryAfterMs: 0 };
}

/** Get current bucket size (for monitoring) */
export function getRateLimitStats(): { bucketSize: number; maxSize: number } {
  return { bucketSize: _userBuckets.size, maxSize: MAX_BUCKET_SIZE };
}
