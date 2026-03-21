import { Response } from 'express';
import crypto from 'crypto';
import HumanizerHistory from '../models/HumanizerHistory';
import HumanizerDailyUsage from '../models/HumanizerDailyUsage';
import User from '../models/User';
import { AuthenticatedRequest } from '../types';
import { runAI } from '../services/aiRouter';
import { buildAICacheHash, getCachedAIResult, setCachedAIResult } from '../services/aiCache';

const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000;
const PROCESS_TIMEOUT_MS = 20_000;
const PROCESS_GLOBAL_TIMEOUT_MS = 20_000;
const HUMANIZER_MAX_CHARS = 4_000;
const HUMANIZER_CHUNK_SIZE = 1_200;
const HUMANIZER_MAX_CHUNKS = 3;
const JOB_TTL_MS = 30 * 60 * 1000;

type PlanTier = 'free' | 'pro' | 'advanced';
type HumanizerMode = 'standard' | 'creative' | 'advanced';

type HumanizerJobStatus = 'processing' | 'done' | 'failed';

interface HumanizerJobResult {
  id?: string;
  humanizedText: string;
  originalText: string;
  wordCount: number;
  mode: HumanizerMode;
  quality: 'high' | 'medium' | 'low';
  aiLikelihoodScore: number;
  notes: string[];
  cached: boolean;
  processingMs?: number;
  planTier: PlanTier;
  limits: PlanWordLimits;
  usageToday: {
    requestsUsed: number;
    wordsProcessed: number;
  };
}

interface HumanizerJobState {
  jobId: string;
  userId: string;
  status: HumanizerJobStatus;
  result: HumanizerJobResult | null;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const humanizerJobs = new Map<string, HumanizerJobState>();

type PlanWordLimits = {
  maxWordsPerRequest: number;
  maxRequestsPerDay: number;
  maxWordsPerDay: number;
};

const HUMANIZER_PLAN_LIMITS: Record<PlanTier, PlanWordLimits> = {
  free: {
    maxWordsPerRequest: 1000,
    maxRequestsPerDay: 5,
    maxWordsPerDay: 3000,
  },
  pro: {
    maxWordsPerRequest: 5000,
    maxRequestsPerDay: 50,
    maxWordsPerDay: 60000,
  },
  advanced: {
    maxWordsPerRequest: 12000,
    maxRequestsPerDay: 200,
    maxWordsPerDay: 300000,
  },
};

function todayKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeText(input: string): string {
  return (input || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitText(text: string, size = HUMANIZER_CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

function qualityFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score <= 25) return 'high';
  if (score <= 45) return 'medium';
  return 'low';
}

function buildHumanizerPrompt(chunk: string): string {
  return [
    'Rewrite this text to sound more natural and human.',
    '',
    'Keep meaning same.',
    'Make it simple and clear.',
    '',
    'TEXT:',
    chunk,
  ].join('\n');
}

function setJobState(jobId: string, patch: Partial<HumanizerJobState>) {
  const current = humanizerJobs.get(jobId);
  if (!current) return;
  humanizerJobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
}

function scheduleJobCleanup(jobId: string) {
  setTimeout(() => {
    const state = humanizerJobs.get(jobId);
    if (!state) return;
    if (Date.now() - state.updatedAt >= JOB_TTL_MS) {
      humanizerJobs.delete(jobId);
    }
  }, JOB_TTL_MS + 1000);
}

function hashInput(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function resolveMode(mode: unknown): HumanizerMode {
  if (mode === 'standard' || mode === 'creative' || mode === 'advanced') {
    return mode;
  }
  return 'standard';
}

function resolvePlanTier(user: {
  plan: 'free' | 'pro';
  planExpiryDate: Date | null;
  aiUsageLimitOverride: number | null;
  uploadUsageLimitOverride: number | null;
}): PlanTier {
  const activePro = user.plan === 'pro' && !!user.planExpiryDate && user.planExpiryDate > new Date();
  if (!activePro) return 'free';

  const aiOverride = typeof user.aiUsageLimitOverride === 'number' ? user.aiUsageLimitOverride : 0;
  const uploadOverride = typeof user.uploadUsageLimitOverride === 'number' ? user.uploadUsageLimitOverride : 0;
  if (aiOverride >= 120 || uploadOverride >= 120) return 'advanced';
  return 'pro';
}

async function getUsage(userId: string) {
  const dayKey = todayKey();
  const usage = await HumanizerDailyUsage.findOneAndUpdate(
    { userId, dayKey },
    { $setOnInsert: { requestsUsed: 0, wordsProcessed: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return usage;
}

async function enforcePlanUsage(userId: string, tier: PlanTier, words: number): Promise<{ requestsUsed: number; wordsProcessed: number }> {
  const limits = HUMANIZER_PLAN_LIMITS[tier];
  const usage = await getUsage(userId);

  if (words > limits.maxWordsPerRequest) {
    throw new Error(`Text exceeds your plan limit (${limits.maxWordsPerRequest} words).`);
  }

  if (usage.requestsUsed >= limits.maxRequestsPerDay) {
    throw new Error('Daily humanizer request quota reached for your plan.');
  }

  if (usage.wordsProcessed + words > limits.maxWordsPerDay) {
    throw new Error('Daily word quota reached for your plan.');
  }

  usage.requestsUsed += 1;
  usage.wordsProcessed += words;
  await usage.save();
  return { requestsUsed: usage.requestsUsed, wordsProcessed: usage.wordsProcessed };
}

async function runWithTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('PROCESSING_TIMEOUT')), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function runHumanizerChunkAI(userId: string, chunk: string): Promise<{
  humanizedText: string;
  aiLikelihoodScore: number;
  note: string;
}> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const aiRes = await runWithTimeout(
        runAI({
          prompt: buildHumanizerPrompt(chunk),
          userId,
          temperature: 0.6,
          maxTokens: 700,
          forceFresh: attempt > 0,
        }),
        PROCESS_TIMEOUT_MS
      );

      const rewritten = aiRes.success && aiRes.text ? aiRes.text.trim() : '';
      if (rewritten && rewritten.length >= 20) {
        return {
          humanizedText: rewritten,
          aiLikelihoodScore: 35,
          note: `Processed via ${aiRes.provider || 'ai-router'}${attempt > 0 ? ' (retry)' : ''}.`,
        };
      }
    } catch (err) {
      if (attempt === 1) {
        console.error('[Humanizer] Chunk failed:', err);
      }
    }
  }

  return {
    humanizedText: chunk,
    aiLikelihoodScore: 50,
    note: 'Chunk fallback applied due to timeout or provider failure.',
  };
}

export const getHumanizerPlans = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: {
      free: HUMANIZER_PLAN_LIMITS.free,
      pro: HUMANIZER_PLAN_LIMITS.pro,
      advanced: HUMANIZER_PLAN_LIMITS.advanced,
    },
  });
};

interface ProcessJobParams {
  jobId: string;
  userId: string;
  mode: HumanizerMode;
  forceFresh: boolean;
  sourceText: string;
}

async function processHumanizerJob({ jobId, userId, mode, forceFresh, sourceText }: ProcessJobParams): Promise<void> {
  try {
    const user = await User.findById(userId).select('plan planExpiryDate aiUsageLimitOverride uploadUsageLimitOverride');
    if (!user) {
      throw new Error('User not found');
    }

    const wasTruncated = sourceText.length > HUMANIZER_MAX_CHARS;
    const workingText = wasTruncated
      ? sourceText.slice(0, HUMANIZER_MAX_CHARS)
      : sourceText;

    const words = wordCount(workingText);
    const tier = resolvePlanTier(user as unknown as {
      plan: 'free' | 'pro';
      planExpiryDate: Date | null;
      aiUsageLimitOverride: number | null;
      uploadUsageLimitOverride: number | null;
    });

    const sharedCacheHash = buildAICacheHash({
      prompt: workingText,
      modelPreferences: { mode },
      temperature: mode === 'advanced' ? 0.8 : 0.6,
      maxTokens: 1400,
    });

    if (!forceFresh) {
      const cachedShared = await getCachedAIResult<{
        humanizedText: string;
        originalText: string;
        wordCount: number;
        mode: HumanizerMode;
        quality: 'high' | 'medium' | 'low';
        aiLikelihoodScore: number;
        notes: string[];
      }>(sharedCacheHash);

      if (cachedShared) {
        const usage = await getUsage(userId);
        setJobState(jobId, {
          status: 'done',
          result: {
            ...cachedShared,
            cached: true,
            planTier: tier,
            limits: HUMANIZER_PLAN_LIMITS[tier],
            usageToday: {
              requestsUsed: usage.requestsUsed,
              wordsProcessed: usage.wordsProcessed,
            },
          },
        });
        return;
      }
    }

    const usage = await enforcePlanUsage(userId, tier, words);

    const inputHash = hashInput(`${mode}::${workingText}`);
    const cacheCutoff = new Date(Date.now() - CACHE_WINDOW_MS);
    const cached = await HumanizerHistory.findOne({
      userId,
      mode,
      inputHash,
      createdAt: { $gte: cacheCutoff },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (cached) {
      setJobState(jobId, {
        status: 'done',
        result: {
          humanizedText: cached.humanizedText,
          originalText: cached.originalText,
          wordCount: cached.wordCount,
          mode: cached.mode,
          quality: cached.quality,
          aiLikelihoodScore: cached.aiLikelihoodScore,
          notes: cached.notes,
          cached: true,
          planTier: tier,
          limits: HUMANIZER_PLAN_LIMITS[tier],
          usageToday: usage,
        },
      });
      return;
    }

    const startedAt = Date.now();
    const chunks = splitText(workingText, HUMANIZER_CHUNK_SIZE).slice(0, HUMANIZER_MAX_CHUNKS);

    const processChunks = async () => {
      const promises = chunks.map((chunk) => runHumanizerChunkAI(userId, chunk));

      const results = await Promise.all(promises);
      const finalText = results.map((r) => r.humanizedText || '').join('\n\n').trim();
      const scoreAvg = results.reduce((sum, r) => sum + r.aiLikelihoodScore, 0) / Math.max(1, results.length);
      const mergedNotes = Array.from(new Set(results.map((r) => r.note))).slice(0, 12);

      if (wasTruncated) {
        mergedNotes.push(`Input capped to ${HUMANIZER_MAX_CHARS} characters for fast processing.`);
      }

      if (sourceText.length > chunks.join('').length) {
        mergedNotes.push(`Processed first ${HUMANIZER_MAX_CHUNKS} chunks for speed.`);
      }

      return {
        humanizedText: finalText || workingText,
        aiLikelihoodScore: Math.max(0, Math.min(100, Math.round(scoreAvg))),
        quality: qualityFromScore(Math.max(0, Math.min(100, Math.round(scoreAvg)))),
        notes: mergedNotes.length > 0 ? mergedNotes : ['Processed in fast mode with chunk fallbacks.'],
      };
    };

    const engineResult = await runWithTimeout(processChunks(), PROCESS_GLOBAL_TIMEOUT_MS).catch((err) => {
      console.error('[Humanizer] Global timeout fallback:', err);
      const notes = ['Global timeout fallback applied; original text returned.'];
      if (wasTruncated) notes.push(`Input capped to ${HUMANIZER_MAX_CHARS} characters for fast processing.`);
      return {
        humanizedText: workingText,
        aiLikelihoodScore: 50,
        quality: 'medium' as const,
        notes,
      };
    });

    const processingMs = Date.now() - startedAt;

    const record = await HumanizerHistory.create({
      userId,
      mode,
      originalText: workingText,
      humanizedText: engineResult.humanizedText,
      wordCount: words,
      inputHash,
      quality: engineResult.quality,
      aiLikelihoodScore: engineResult.aiLikelihoodScore,
      notes: engineResult.notes,
      processingMs,
      cachedFromPrevious: false,
    });

    await setCachedAIResult(
      sharedCacheHash,
      {
        humanizedText: record.humanizedText,
        originalText: record.originalText,
        wordCount: record.wordCount,
        mode: record.mode,
        quality: record.quality,
        aiLikelihoodScore: record.aiLikelihoodScore,
        notes: record.notes,
      },
      24
    );

    setJobState(jobId, {
      status: 'done',
      result: {
        id: record._id.toString(),
        humanizedText: record.humanizedText,
        originalText: record.originalText,
        wordCount: record.wordCount,
        mode: record.mode,
        quality: record.quality,
        aiLikelihoodScore: record.aiLikelihoodScore,
        notes: record.notes,
        cached: false,
        processingMs,
        planTier: tier,
        limits: HUMANIZER_PLAN_LIMITS[tier],
        usageToday: usage,
      },
      error: undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Humanizer failed';
    const state = humanizerJobs.get(jobId);
    const fallbackSource = state?.result?.originalText || sourceText;

    setJobState(jobId, {
      status: 'failed',
      error: message,
      result: {
        humanizedText: fallbackSource,
        originalText: fallbackSource,
        wordCount: wordCount(fallbackSource),
        mode,
        quality: 'medium',
        aiLikelihoodScore: 50,
        notes: ['Fallback result returned after background processing failure.'],
        cached: false,
        planTier: 'free',
        limits: HUMANIZER_PLAN_LIMITS.free,
        usageToday: {
          requestsUsed: 0,
          wordsProcessed: 0,
        },
      },
    });
  }
}

export const processHumanizerText = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const mode = resolveMode((req.body as { mode?: unknown })?.mode);
    const forceFresh = Boolean((req.body as { forceFresh?: unknown })?.forceFresh);
    const sourceText = normalizeText(String((req.body as { text?: unknown })?.text || ''));
    if (!sourceText) {
      res.status(400).json({ success: false, error: 'Input text is empty.' });
      return;
    }

    if (req.aiLimited) {
      const fallback = {
        humanizedText: sourceText,
        originalText: sourceText,
        wordCount: wordCount(sourceText),
        mode,
        quality: 'medium' as const,
        aiLikelihoodScore: 50,
        notes: ['AI rate limit reached. Returning original text.'],
        cached: false,
        planTier: 'free' as const,
        limits: HUMANIZER_PLAN_LIMITS.free,
        usageToday: {
          requestsUsed: 0,
          wordsProcessed: 0,
        },
        limited: true,
        limitReason: req.aiLimitReason || 'AI rate limit reached. Returning original text.',
      };

      res.json({
        success: true,
        limited: true,
        data: fallback,
        message: req.aiLimitReason || 'AI rate limit reached. Returned fallback humanized text.',
      });
      return;
    }

    const jobId = crypto.randomUUID();
    humanizerJobs.set(jobId, {
      jobId,
      userId,
      status: 'processing',
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    void processHumanizerJob({
      jobId,
      userId,
      mode,
      forceFresh,
      sourceText,
    }).finally(() => scheduleJobCleanup(jobId));

    res.json({
      success: true,
      jobId,
      status: 'processing',
      data: {
        jobId,
        status: 'processing',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Humanizer failed';
    const status = /Unauthorized|User not found/.test(message) ? 401
      : /limit|quota|exceeds/i.test(message) ? 429
      : 500;

    res.status(status).json({
      success: false,
      error: message,
    });
  }
};

export const getHumanizerProcessResult = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const jobId = String(req.params.jobId || '');
  const job = humanizerJobs.get(jobId);

  if (!job || job.userId !== userId) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }

  res.json({
    success: true,
    jobId: job.jobId,
    status: job.status,
    result: job.result,
    error: job.error,
    data: {
      jobId: job.jobId,
      status: job.status,
      result: job.result,
      error: job.error,
    },
  });
};

export const listHumanizerHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limitRaw = Number.parseInt(String(req.query.limit || '20'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;

    const rows = await HumanizerHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to load history' });
  }
};

export const saveHumanizerVersion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const mode = resolveMode((req.body as { mode?: unknown })?.mode);
    const originalText = normalizeText(String((req.body as { originalText?: unknown })?.originalText || ''));
    const humanizedText = normalizeText(String((req.body as { humanizedText?: unknown })?.humanizedText || ''));

    if (!originalText || !humanizedText) {
      res.status(400).json({ success: false, error: 'Both originalText and humanizedText are required.' });
      return;
    }

    const words = wordCount(originalText);
    const record = await HumanizerHistory.create({
      userId,
      mode,
      originalText,
      humanizedText,
      wordCount: words,
      inputHash: hashInput(`${mode}::${originalText}`),
      quality: 'medium',
      aiLikelihoodScore: 50,
      notes: ['Saved manually by user.'],
      processingMs: 0,
      cachedFromPrevious: false,
    });

    res.json({ success: true, data: record, message: 'Saved to history' });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Save failed' });
  }
};
