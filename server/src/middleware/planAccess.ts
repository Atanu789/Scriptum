import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../types';
import User, { Plan } from '../models/User';
import DocumentModel from '../models/Document';
import { PLAN_LIMITS } from '../services/razorpayService';

const ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

type PlanLimitShape = typeof PLAN_LIMITS['free'];
type FeatureKey = {
  [K in keyof PlanLimitShape]: PlanLimitShape[K] extends boolean ? K : never;
}[keyof PlanLimitShape];

/**
 * Middleware factory — ensures the authenticated user's plan has access to
 * a specific boolean feature flag (e.g. 'teleprompterAI', 'exportPPT').
 *
 * Usage:
 *   router.post('/generate', authenticate, requireFeature('ttsNarration'), handler);
 */
export function requireFeature(feature: FeatureKey) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const user = await User.findById(userId).select('plan planExpiryDate');
      if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

      // Downgrade expired paid plans at access-check time
      const effectivePlan = resolveEffectivePlan(user.plan, user.planExpiryDate);
      const limits = PLAN_LIMITS[effectivePlan];
      const allowed = limits[feature];

      if (!allowed) {
        res.status(403).json({
          success: false,
          error:   `Feature '${feature}' requires a Pro plan. Upgrade at /pricing.`,
          code:    'PLAN_UPGRADE_REQUIRED',
          feature,
        });
        return;
      }

      next();
    } catch (err) {
      console.error('requireFeature error:', err);
      res.status(500).json({ success: false, error: 'Plan check failed' });
    }
  };
}

export function requireFeatureWithOneTimeTrial(
  feature: FeatureKey,
  trialField:
    | 'trialTtsNarrationUsed'
    | 'trialExportUsed'
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const user = await User.findById(userId).select(`plan planExpiryDate ${trialField}`);
      if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

      const effectivePlan = resolveEffectivePlan(user.plan, user.planExpiryDate);
      const limits = PLAN_LIMITS[effectivePlan];
      const allowed = limits[feature];

      if (allowed) {
        next();
        return;
      }

      const trialUsed = Boolean((user as unknown as Record<string, unknown>)[trialField]);
      if (effectivePlan === 'free' && !trialUsed) {
        (user as unknown as Record<string, unknown>)[trialField] = true;
        await user.save();
        next();
        return;
      }

      res.status(403).json({
        success: false,
        error: `Feature '${feature}' requires a Pro plan. Upgrade at /pricing.`,
        code: 'PLAN_UPGRADE_REQUIRED',
        feature,
        trialUsed,
      });
      return;
    } catch (err) {
      console.error('requireFeatureWithOneTimeTrial error:', err);
      res.status(500).json({ success: false, error: 'Plan check failed' });
    }
  };
}

/**
 * Middleware — increments aiUsageThisMonth and enforces monthly AI quota.
 * Automatically resets the counter if a new calendar month has started.
 */
export async function checkAIUsage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const user = await User.findById(userId).select(
      'plan planExpiryDate aiUsageThisMonth aiUsageResetAt aiUsageLimitOverride trialAiOverageUsed'
    );
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    // Monthly reset
    const now        = new Date();
    const resetAt    = user.aiUsageResetAt ?? user.createdAt ?? now;
    const sameMonth  =
      resetAt.getMonth()     === now.getMonth() &&
      resetAt.getFullYear()  === now.getFullYear();

    let usageMutated = false;

    if (!sameMonth) {
      user.aiUsageThisMonth = 0;
      user.aiUsageResetAt   = now;
      usageMutated = true;
    }

    // Do not charge usage when this analyze request would be served from cache.
    const isAnalyzeRequest = req.method === 'POST' && /^\/[^/]+$/.test(req.path || '');
    const isForced = req.query.force === '1';
    const docId = req.params?.id;
    if (isAnalyzeRequest && docId && !isForced) {
      const doc = await DocumentModel.findOne({ _id: docId, userId })
        .select('cleanedText contentHash analysisRunAt aiScore')
        .lean();

      if (doc) {
        const sourceText = typeof doc.cleanedText === 'string' ? doc.cleanedText : '';
        const newHash = hashText(sourceText);
        const isCacheHit =
          doc.contentHash === newHash &&
          doc.analysisRunAt !== null &&
          Date.now() - new Date(doc.analysisRunAt).getTime() < ANALYSIS_CACHE_TTL_MS &&
          doc.aiScore !== null;

        if (isCacheHit) {
          if (usageMutated) {
            await user.save();
          }
          next();
          return;
        }
      }
    }

    const effectivePlan = resolveEffectivePlan(user.plan, user.planExpiryDate);
    const planLimit = PLAN_LIMITS[effectivePlan].aiUsagePerMonth;
    const overrideLimit = typeof user.aiUsageLimitOverride === 'number' ? user.aiUsageLimitOverride : null;
    const limit = overrideLimit !== null ? overrideLimit : planLimit;

    if (limit !== -1 && user.aiUsageThisMonth >= limit) {
      if (effectivePlan === 'free' && !user.trialAiOverageUsed) {
        user.aiUsageThisMonth += 1;
        user.trialAiOverageUsed = true;
        await user.save();
        next();
        return;
      }

      req.aiLimited = true;
      req.aiLimitReason = `Monthly AI analysis limit (${limit}) reached. Using fallback mode.`;

      if (usageMutated) {
        await user.save();
      }

      next();
      return;
    }

    user.aiUsageThisMonth += 1;
    await user.save();

    next();
  } catch (err) {
    console.error('checkAIUsage error:', err);
    res.status(500).json({ success: false, error: 'Usage check failed' });
  }
}

/**
 * Middleware — increments uploadUsageThisMonth and enforces monthly upload quota.
 */
export async function checkUploadUsage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const user = await User.findById(userId).select('plan planExpiryDate uploadUsageThisMonth uploadUsageLimitOverride trialUploadOverageUsed');
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    const effectivePlan = resolveEffectivePlan(user.plan, user.planExpiryDate);
    const planLimit = PLAN_LIMITS[effectivePlan].uploadsPerMonth;
    const overrideLimit = typeof user.uploadUsageLimitOverride === 'number' ? user.uploadUsageLimitOverride : null;
    const limit = overrideLimit !== null ? overrideLimit : planLimit;

    if (limit !== -1 && user.uploadUsageThisMonth >= limit) {
      if (effectivePlan === 'free' && !user.trialUploadOverageUsed) {
        user.uploadUsageThisMonth += 1;
        user.trialUploadOverageUsed = true;
        await user.save();
        next();
        return;
      }

      res.status(429).json({
        success: false,
        error:   `Monthly upload limit (${limit}) reached. Upgrade to Pro for higher limits.`,
        code:    'UPLOAD_LIMIT_REACHED',
        usage:   user.uploadUsageThisMonth,
        limit,
        trialUsed: user.trialUploadOverageUsed,
      });
      return;
    }

    user.uploadUsageThisMonth += 1;
    await user.save();

    next();
  } catch (err) {
    console.error('checkUploadUsage error:', err);
    res.status(500).json({ success: false, error: 'Upload quota check failed' });
  }
}

export const checkExportAccess = requireFeatureWithOneTimeTrial('exportPPT', 'trialExportUsed');

// ─── Helper ───────────────────────────────────────────────────────────────────

function resolveEffectivePlan(plan: Plan, expiryDate: Date | null): Plan {
  if (plan === 'free') return 'free';
  // Paid plan — check expiry
  if (expiryDate && expiryDate > new Date()) return plan;
  return 'free'; // expired → treat as free
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate()
  );
}

export async function checkTTSNarrationAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const user = await User.findById(userId).select(
      'plan planExpiryDate trialTtsNarrationUsed ttsUsageToday ttsUsageDate ttsUsageLimitOverride'
    );
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    const effectivePlan = resolveEffectivePlan(user.plan, user.planExpiryDate);
    const limits = PLAN_LIMITS[effectivePlan];

    // Free users keep one one-time narration trial.
    if (!limits.ttsNarration) {
      if (effectivePlan === 'free' && !user.trialTtsNarrationUsed) {
        user.trialTtsNarrationUsed = true;
        await user.save();
        next();
        return;
      }

      res.status(403).json({
        success: false,
        error: "Feature 'ttsNarration' requires a Pro plan. Upgrade at /pricing.",
        code: 'PLAN_UPGRADE_REQUIRED',
        feature: 'ttsNarration',
      });
      return;
    }

    const baseLimit = limits.ttsRequestsPerDay;
    const overrideLimit = typeof user.ttsUsageLimitOverride === 'number' ? user.ttsUsageLimitOverride : null;
    const limit = overrideLimit !== null ? overrideLimit : baseLimit;

    const now = new Date();
    const usageDate = user.ttsUsageDate;
    if (!usageDate || !isSameUtcDay(usageDate, now)) {
      user.ttsUsageToday = 0;
      user.ttsUsageDate = now;
    }

    if (limit !== -1 && user.ttsUsageToday >= limit) {
      res.status(429).json({
        success: false,
        error: `Daily teleprompter narration limit (${limit}) reached.`,
        code: 'TTS_DAILY_LIMIT_REACHED',
        usage: user.ttsUsageToday,
        limit,
      });
      return;
    }

    user.ttsUsageToday += 1;
    user.ttsUsageDate = now;
    await user.save();
    next();
  } catch (err) {
    console.error('checkTTSNarrationAccess error:', err);
    res.status(500).json({ success: false, error: 'TTS access check failed' });
  }
}
