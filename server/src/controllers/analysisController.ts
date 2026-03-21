import { Response } from 'express';
import { param, validationResult } from 'express-validator';
import crypto from 'crypto';
import DocumentModel from '../models/Document';
import { analyzeDocument as runAnalysis } from '../services/aiAnalysis';
import {
  splitIntoSentences,
} from '../services/ai/aiScoreAnalyzer';
import { runAI } from '../services/aiRouter';
import { humanizeDocumentText } from '../services/ai/humanizerEngine';
import { htmlToStructuredModel, plainTextToEditorHtml, structureDocument } from '../services/documentStructure';
import { AuthenticatedRequest, HumanizeMode } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DOC_HUMANIZE_CHUNK_SIZE = 1200;
const DOC_HUMANIZE_MAX_PARALLEL_CHUNKS = 3;
const DOC_HUMANIZE_CHUNK_TIMEOUT_MS = 5000;
const DOC_HUMANIZE_JOB_TTL_MS = 30 * 60 * 1000;

type HumanizeJobStatus = 'processing' | 'done' | 'failed';

interface DocumentHumanizeJobState {
  jobId: string;
  userId: string;
  documentId: string;
  mode: HumanizeMode;
  styleProfile?: 'student' | 'journalist' | 'casual-speaker' | 'academic';
  status: HumanizeJobStatus;
  progress: number;
  chunksDone: number;
  totalChunks: number;
  partialResults: string[];
  result: HumanizeResultPayload | null;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface HumanizeResultPayload {
  documentId: string;
  appliedCount: number;
  totalSentences?: number;
  rewrittenPercent?: number;
  averageLengthSimilarity?: number;
  mode?: HumanizeMode;
  styleProfile?: 'student' | 'journalist' | 'casual-speaker' | 'academic' | 'balanced-neutral';
  originalText?: string;
  appliedRewrites: Array<{ original: string; replacement: string }>;
  cleanedText: string;
  aiLikelihoodScore?: number;
  quality?: 'high' | 'medium' | 'low';
  notes?: string[];
  retryCount?: number;
  evaluationReason?: string;
  limited?: boolean;
  limitReason?: string;
  analysis?: {
    aiScore: number | null;
    analyzedAt: Date;
  };
}

const documentHumanizeJobs = new Map<string, DocumentHumanizeJobState>();

function splitText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

function humanizeChunkPrompt(chunk: string, mode: HumanizeMode, styleProfile?: 'student' | 'journalist' | 'casual-speaker' | 'academic'): string {
  const style = styleProfile ? `Style profile: ${styleProfile}.` : 'Style profile: balanced-neutral.';
  const intensity = mode === 'conservative'
    ? 'Use minimal edits and keep wording close to source.'
    : mode === 'aggressive'
    ? 'Use strong rewrites for natural flow while preserving exact meaning.'
    : 'Use moderate rewrites for readability and natural tone.';

  return [
    'Rewrite this passage to sound natural and human.',
    intensity,
    style,
    'Rules:',
    '- Preserve meaning exactly.',
    '- Do not add new facts.',
    '- Return plain text only.',
    '',
    'Text:',
    chunk,
  ].join('\n');
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let handle: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    handle = setTimeout(() => reject(new Error('CHUNK_TIMEOUT')), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}

function updateHumanizeJob(jobId: string, patch: Partial<DocumentHumanizeJobState>): void {
  const current = documentHumanizeJobs.get(jobId);
  if (!current) return;
  documentHumanizeJobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
}

function scheduleHumanizeJobCleanup(jobId: string): void {
  setTimeout(() => {
    const job = documentHumanizeJobs.get(jobId);
    if (!job) return;
    if (Date.now() - job.updatedAt >= DOC_HUMANIZE_JOB_TTL_MS) {
      documentHumanizeJobs.delete(jobId);
    }
  }, DOC_HUMANIZE_JOB_TTL_MS + 1000);
}

async function processDocumentHumanizeJob(jobId: string): Promise<void> {
  const job = documentHumanizeJobs.get(jobId);
  if (!job) return;

  try {
    const doc = await DocumentModel.findOne({ _id: job.documentId, userId: job.userId });
    if (!doc) {
      throw new Error('Document not found');
    }

    const sourceText = (doc.cleanedText || '').trim();
    if (!sourceText) {
      throw new Error('Document text is empty');
    }

    const chunks = splitText(sourceText, DOC_HUMANIZE_CHUNK_SIZE);
    const totalChunks = chunks.length;
    const partialResults = Array<string>(totalChunks).fill('');
    const notes: string[] = [];

    updateHumanizeJob(jobId, {
      totalChunks,
      chunksDone: 0,
      progress: 0,
      partialResults,
    });

    for (let i = 0; i < totalChunks; i += DOC_HUMANIZE_MAX_PARALLEL_CHUNKS) {
      const batch = chunks.slice(i, i + DOC_HUMANIZE_MAX_PARALLEL_CHUNKS);

      const results = await Promise.all(batch.map(async (chunk, batchIdx) => {
        const absoluteIdx = i + batchIdx;
        try {
          const ai = await withTimeout(
            runAI({
              prompt: humanizeChunkPrompt(chunk, job.mode, job.styleProfile),
              userId: job.userId,
              temperature: job.mode === 'conservative' ? 0.35 : job.mode === 'aggressive' ? 0.75 : 0.55,
              maxTokens: 900,
              forceFresh: true,
            }),
            DOC_HUMANIZE_CHUNK_TIMEOUT_MS
          );

          const rewritten = ai.success && ai.text ? ai.text.trim() : '';
          return { index: absoluteIdx, text: rewritten || chunk, fallback: !rewritten };
        } catch {
          return { index: absoluteIdx, text: chunk, fallback: true };
        }
      }));

      for (const result of results) {
        partialResults[result.index] = result.text;
        if (result.fallback) {
          notes.push(`Chunk ${result.index + 1} fallback used.`);
        }
      }

      const chunksDone = Math.min(totalChunks, i + DOC_HUMANIZE_MAX_PARALLEL_CHUNKS);
      const progress = totalChunks > 0 ? Math.round((chunksDone / totalChunks) * 100) : 0;

      updateHumanizeJob(jobId, {
        chunksDone,
        progress,
        partialResults: [...partialResults],
      });
    }

    const humanizedText = partialResults.join('\n\n').trim();
    const originalText = sourceText;
    const originalSentences = splitIntoSentences(originalText);
    const rewrittenPercent = 100;
    const averageLengthSimilarity = Math.round(lengthSimilarity(originalText, humanizedText) * 100) / 100;

    // Store the original AI score before humanization (don't re-analyze to avoid score inflation)
    const originalAnalysisScore = normalizeAiScore(doc.aiScore, 0);
    const originalAnalysisTime = doc.analysisRunAt || new Date();

    doc.cleanedText = humanizedText;
    doc.editorHtml = plainTextToEditorHtml(humanizedText);
    doc.editorModel = htmlToStructuredModel(doc.editorHtml);
    doc.structuredContent = structureDocument(humanizedText);
    doc.lastHumanizeOriginalText = originalText;
    doc.lastHumanizeMode = job.mode;
    // Don't update analysis metrics — keep original AI score, suppress re-analysis overhead
    doc.status = 'analyzed';
    await doc.save();

    const result: HumanizeResultPayload = {
      documentId: doc._id.toString(),
      appliedCount: totalChunks,
      totalSentences: originalSentences.length,
      rewrittenPercent,
      averageLengthSimilarity,
      mode: job.mode,
      styleProfile: job.styleProfile || 'balanced-neutral',
      originalText,
      appliedRewrites: chunks.slice(0, totalChunks).map((original, idx) => ({
        original,
        replacement: partialResults[idx] || original,
      })).slice(0, 200),
      cleanedText: humanizedText,
      aiLikelihoodScore: originalAnalysisScore,
      quality: (originalAnalysisScore <= 25 ? 'high' : originalAnalysisScore <= 45 ? 'medium' : 'low'),
      notes: notes.length > 0 ? notes : ['Processed in progressive chunk mode. Re-analyze to get updated AI score.'],
      retryCount: 0,
      evaluationReason: 'Progressive chunk humanization completed.',
      analysis: {
        aiScore: originalAnalysisScore,
        analyzedAt: originalAnalysisTime,
      },
    };

    updateHumanizeJob(jobId, {
      status: 'done',
      progress: 100,
      chunksDone: totalChunks,
      totalChunks,
      partialResults: [...partialResults],
      result,
      error: undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Humanize job failed';
    updateHumanizeJob(jobId, {
      status: 'failed',
      error: message,
    });
  }
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function resolveHumanizeMode(mode: unknown): HumanizeMode {
  if (mode === 'conservative' || mode === 'balanced' || mode === 'aggressive') {
    return mode;
  }
  return 'balanced';
}

function rebuildTextFromSentences(sentences: string[]): string {
  return sentences
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function lengthSimilarity(original: string, rewritten: string): number {
  const o = Math.max(1, original.trim().length);
  const r = Math.max(1, rewritten.trim().length);
  const similarity = 1 - Math.abs(o - r) / o;
  return Math.max(0, Math.min(1, similarity));
}

function normalizeAiScore(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function estimateFallbackAiScore(text: string): number {
  const cleaned = (text || '').trim();
  if (!cleaned) return 0;

  const words = cleaned.split(/\s+/).filter(Boolean);
  const sentences = splitIntoSentences(cleaned);
  const sentenceCount = Math.max(1, sentences.length);
  const avgWordsPerSentence = words.length / sentenceCount;

  const lowerWords = words.map((w) => w.toLowerCase());
  const uniqueRatio = words.length > 0 ? new Set(lowerWords).size / words.length : 1;
  const repeatedBigrams = new Map<string, number>();
  for (let i = 0; i < lowerWords.length - 1; i += 1) {
    const gram = `${lowerWords[i]} ${lowerWords[i + 1]}`;
    repeatedBigrams.set(gram, (repeatedBigrams.get(gram) ?? 0) + 1);
  }
  const repeatedBigramCount = Array.from(repeatedBigrams.values()).filter((count) => count >= 3).length;

  let score = 35;
  if (avgWordsPerSentence > 22) score += 10;
  if (avgWordsPerSentence < 8) score += 6;
  if (uniqueRatio < 0.5) score += 12;
  if (repeatedBigramCount >= 2) score += Math.min(10, repeatedBigramCount * 2);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildLimitedAnalysisPayload(documentId: string, sourceText: string, fallbackWordCount?: number, limitReason?: string) {
  const sentenceCount = splitIntoSentences(sourceText).length;
  const wordCount = typeof fallbackWordCount === 'number' && Number.isFinite(fallbackWordCount)
    ? fallbackWordCount
    : sourceText.trim().split(/\s+/).filter(Boolean).length;

  return {
    documentId,
    aiScore: estimateFallbackAiScore(sourceText),
    aiReasoning: limitReason || 'AI rate limit reached. Returning lightweight fallback analysis.',
    humanizationTips: [],
    humanizationSuggestions: [],
    claimFlags: [],
    grammarScore: 0,
    grammarIssues: [],
    readabilityScore: 0,
    toneScore: 50,
    wordCount,
    sentenceCount,
    readingTimeMinutes: 0,
    fleschGradeLevel: 'N/A',
    avgSentenceLength: 0,
    longSentences: [],
    tone: null,
    analyzedAt: new Date().toISOString(),
    limited: true,
    limitReason: limitReason || 'AI rate limit reached. Returning lightweight fallback analysis.',
  };
}

function parseAbstractPayload(raw: string): { abstract: string; keyPoints: string[] } {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid abstract response format');
  }

  const parsed = JSON.parse(jsonMatch[0]) as { abstract?: unknown; keyPoints?: unknown };
  const abstract = typeof parsed.abstract === 'string' ? parsed.abstract.trim() : '';
  const keyPoints = Array.isArray(parsed.keyPoints)
    ? parsed.keyPoints
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  if (!abstract) {
    throw new Error('Abstract content is empty');
  }

  return { abstract, keyPoints };
}

export const analyzeDocumentValidation = [
  param('id').isMongoId().withMessage('Invalid document ID'),
];

export const analyzeDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const id = req.params?.id;
  const userId = req.user?.userId;
  if (!id) {
    res.status(400).json({ success: false, error: 'Document ID required' });
    return;
  }

  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  let sourceTextForFallback = '';
  let fallbackWordCount: number | undefined;

  try {
    const doc = await DocumentModel.findOne({
      _id: id,
      userId,
    }).lean();

    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const sourceText = typeof doc.cleanedText === 'string' ? doc.cleanedText : '';
    sourceTextForFallback = sourceText;
    fallbackWordCount = doc.wordCount ?? undefined;
    if (!sourceText.trim()) {
      res.status(400).json({ success: false, error: 'Document text is empty' });
      return;
    }

    const newHash = hashText(sourceText);
    const forceRerun = req.query.force === '1';
    const isCacheHit =
      !forceRerun &&
      doc.contentHash === newHash &&
      doc.analysisRunAt !== null &&
      Date.now() - new Date(doc.analysisRunAt).getTime() < CACHE_TTL_MS &&
      doc.aiScore !== null;

    if (isCacheHit) {
      const cachedToneScore = doc.tone?.confidence != null
        ? Math.round(doc.tone.confidence * 100)
        : 50;
      res.json({
        success: true,
        cached: true,
        data: {
          documentId: id,
          aiScore: doc.aiScore,
          aiReasoning: doc.aiReasoning,
          humanizationTips: doc.humanizationTips ?? [],
          humanizationSuggestions: doc.humanizationSuggestions ?? [],
          claimFlags: (doc as any).claimFlags ?? [],
          grammarScore: doc.grammarScore,
          grammarIssues: doc.grammarIssues,
          readabilityScore: doc.readabilityScore,
          toneScore: cachedToneScore,
          wordCount: doc.wordCount,
          sentenceCount: doc.sentenceCount,
          readingTimeMinutes: doc.readingTimeMinutes,
          fleschGradeLevel: doc.fleschGradeLevel,
          avgSentenceLength: doc.avgSentenceLength,
          longSentences: (doc as any).longSentences ?? [],
          tone: (doc as any).tone ?? null,
          analyzedAt: doc.analysisRunAt,
        },
        message: 'Returned from cache',
      });
      return;
    }

    if (req.aiLimited) {
      const limitedResult = buildLimitedAnalysisPayload(id, sourceText, doc.wordCount ?? undefined, req.aiLimitReason);
      res.json({
        success: true,
        cached: false,
        limited: true,
        data: limitedResult,
        message: req.aiLimitReason || 'AI rate limit reached. Returned fallback analysis.',
      });
      return;
    }

    await DocumentModel.findByIdAndUpdate(id, { status: 'processing' });

    const analysis = await runAnalysis(sourceText, userId);
    if (analysis.aiScore === null || !Number.isFinite(analysis.aiScore) || analysis.aiScore < 0) {
      await DocumentModel.findByIdAndUpdate(id, { status: 'pending' }).catch(() => {});
      const limitedResult = buildLimitedAnalysisPayload(
        id,
        sourceText,
        doc.wordCount ?? undefined,
        'AI output could not be validated. Showing fallback analysis.'
      );
      res.json({
        success: true,
        cached: false,
        limited: true,
        data: limitedResult,
        message: 'AI output could not be validated. Showing fallback analysis.',
      });
      return;
    }
    const analyzedAt = new Date();

    const updated = await DocumentModel.findByIdAndUpdate(
      id,
      {
        $set: {
          contentHash: newHash,
          aiScore: analysis.aiScore,
          grammarScore: analysis.grammarScore,
          grammarIssues: analysis.grammarIssues,
          readabilityScore: analysis.readabilityScore,
          sentenceCount: analysis.sentenceCount,
          readingTimeMinutes: analysis.readingTimeMinutes,
          fleschGradeLevel: analysis.fleschGradeLevel,
          avgSentenceLength: analysis.avgSentenceLength,
          longSentences: analysis.longSentences,
          claimFlags: analysis.claimFlags,
          tone: analysis.tone,
          aiReasoning: analysis.aiReasoning,
          humanizationTips: analysis.humanizationTips,
          humanizationSuggestions: analysis.humanizationSuggestions,
          analysisRunAt: analyzedAt,
          status: 'analyzed',
        },
      },
      { new: true }
    );

    const responseAiScore = normalizeAiScore(updated?.aiScore, normalizeAiScore(analysis.aiScore, 0));

    res.json({
      success: true,
      cached: false,
      data: {
        documentId: id,
        aiScore: responseAiScore,
        aiReasoning: analysis.aiReasoning,
        humanizationTips: analysis.humanizationTips,
        humanizationSuggestions: analysis.humanizationSuggestions,
        claimFlags: analysis.claimFlags,
        grammarScore: updated?.grammarScore,
        grammarIssues: updated?.grammarIssues,
        readabilityScore: updated?.readabilityScore,
        toneScore: analysis.tone?.confidence != null ? Math.round(analysis.tone.confidence * 100) : 50,
        wordCount: doc.wordCount,
        sentenceCount: analysis.sentenceCount,
        readingTimeMinutes: analysis.readingTimeMinutes,
        fleschGradeLevel: analysis.fleschGradeLevel,
        avgSentenceLength: analysis.avgSentenceLength,
        longSentences: analysis.longSentences,
        tone: analysis.tone,
        analyzedAt,
      },
      message: 'Analysis complete',
    });
  } catch (err) {
    if (id) {
      await DocumentModel.findByIdAndUpdate(id, { status: 'pending' }).catch(() => {});
    }
    console.error('[Analysis] Error:', err);
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      const lower = message.toLowerCase();
      const isAiTransient =
        lower.includes('ai temporarily unavailable') ||
        lower.includes('ai failed to generate valid response') ||
        lower.includes('request_timeout') ||
        lower.includes('rate limit') ||
        lower.includes('quota') ||
        lower.includes('no endpoints found') ||
        lower.includes('keys_missing');

      const isInputIssue =
        lower.includes('text too short') ||
        lower.includes('text too long') ||
        lower.includes('document text is empty');

      if (isAiTransient) {
        const fallbackText = sourceTextForFallback.trim();
        if (fallbackText) {
          const limitedResult = buildLimitedAnalysisPayload(id, fallbackText, fallbackWordCount, message);
          res.json({
            success: true,
            cached: false,
            limited: true,
            data: limitedResult,
            message,
          });
          return;
        }

        res.status(503).json({ success: false, error: message });
        return;
      }

      if (isInputIssue) {
        res.status(400).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
};

export const humanizeDetectedText = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const id = req.params?.id;
  const userId = req.user?.userId;
  if (!id) {
    res.status(400).json({ success: false, error: 'Document ID required' });
    return;
  }

  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    const doc = await DocumentModel.findOne({ _id: id, userId }).lean();

    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const sourceText = doc.cleanedText || '';
    if (!sourceText.trim()) {
      res.status(400).json({ success: false, error: 'Document text is empty' });
      return;
    }

    if (req.aiLimited) {
      const now = new Date();
      const jobId = crypto.randomUUID();
      const limitedResult: HumanizeResultPayload = {
        documentId: id,
        appliedCount: 0,
        totalSentences: splitIntoSentences(sourceText).length,
        rewrittenPercent: 0,
        averageLengthSimilarity: 1,
        mode: 'balanced',
        originalText: sourceText,
        appliedRewrites: [],
        cleanedText: sourceText,
        aiLikelihoodScore: 50,
        quality: 'medium',
        notes: ['AI rate limit reached. Returning original text.'],
        evaluationReason: req.aiLimitReason || 'AI rate limit reached',
        limited: true,
        limitReason: req.aiLimitReason || 'AI rate limit reached. Returning original text.',
        analysis: {
          aiScore: 50,
          analyzedAt: now,
        },
      };

      documentHumanizeJobs.set(jobId, {
        jobId,
        userId,
        documentId: id,
        mode: 'balanced',
        status: 'done',
        progress: 100,
        chunksDone: 0,
        totalChunks: 0,
        partialResults: [sourceText],
        result: limitedResult,
        error: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      scheduleHumanizeJobCleanup(jobId);

      res.json({
        success: true,
        limited: true,
        data: {
          jobId,
          status: 'done',
          progress: 100,
          chunksDone: 0,
          totalChunks: 0,
          limited: true,
          limitReason: req.aiLimitReason || 'AI rate limit reached. Returning original text.',
        },
        message: req.aiLimitReason || 'AI rate limit reached. Returned fallback humanize result.',
      });
      return;
    }

    const mode = resolveHumanizeMode((req.body as { mode?: unknown })?.mode);
    const rawStyleProfile = (req.body as { styleProfile?: unknown })?.styleProfile;
    const styleProfile = rawStyleProfile === 'student'
      || rawStyleProfile === 'journalist'
      || rawStyleProfile === 'casual-speaker'
      || rawStyleProfile === 'academic'
      ? rawStyleProfile
      : undefined;
    const chunks = splitText(sourceText, DOC_HUMANIZE_CHUNK_SIZE);
    const jobId = crypto.randomUUID();

    documentHumanizeJobs.set(jobId, {
      jobId,
      userId,
      documentId: id,
      mode,
      styleProfile,
      status: 'processing',
      progress: 0,
      chunksDone: 0,
      totalChunks: chunks.length,
      partialResults: [],
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    void processDocumentHumanizeJob(jobId).finally(() => {
      scheduleHumanizeJobCleanup(jobId);
    });

    res.json({
      success: true,
      data: {
        jobId,
        status: 'processing',
        progress: 0,
        chunksDone: 0,
        totalChunks: chunks.length,
      },
      message: 'Humanize job started',
    });
  } catch (err) {
    console.error('[Humanize] Error:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Humanization failed',
    });
  }
};

export const getDocumentHumanizeJob = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const id = req.params?.id;
  const jobId = req.params?.jobId;
  if (!id || !jobId) {
    res.status(400).json({ success: false, error: 'Document ID and job ID required' });
    return;
  }

  const job = documentHumanizeJobs.get(jobId);
  if (!job || job.userId !== userId || job.documentId !== id) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  const partialText = job.partialResults.filter(Boolean).join('\n\n').trim();

  res.json({
    success: true,
    data: {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      chunksDone: job.chunksDone,
      totalChunks: job.totalChunks,
      partialText,
      result: job.result,
      error: job.error,
    },
  });
};

export const generateAbstract = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const id = req.params?.id;
  if (!id) {
    res.status(400).json({ success: false, error: 'Document ID required' });
    return;
  }

  try {
    const doc = await DocumentModel.findOne({
      _id: id,
      userId: req.user!.userId,
    }).lean();

    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const sourceText = (doc.cleanedText || '').trim();
    if (!sourceText) {
      res.status(400).json({ success: false, error: 'Document text is empty' });
      return;
    }

    const prompt = `You are an expert technical editor.

Create a concise abstract for the provided document.

Return ONLY valid JSON with this exact shape:
{
  "abstract": "3-5 lines summary",
  "keyPoints": ["Point 1", "Point 2", "Point 3"]
}

Rules:
- Keep abstract in 3 to 5 short lines.
- Provide 3 to 6 key points as clear bullet-ready strings.
- Do not include markdown or extra text.

Document:\n${sourceText.slice(0, 12000)}`;

    const ai = await runAI({
      prompt,
      modelPreferences: {
        groq: ['llama-3.1-8b-instant'],
        openrouter: ['openrouter/auto'],
      },
      temperature: 0.2,
      maxTokens: 700,
      userId: req.user?.userId,
    });

    if (!ai.success || !ai.text) {
      res.status(503).json({
        success: false,
        error: 'AI temporarily unavailable',
      });
      return;
    }

    const parsed = parseAbstractPayload(ai.text);

    res.json({
      success: true,
      data: {
        documentId: id,
        abstract: parsed.abstract,
        keyPoints: parsed.keyPoints,
      },
      message: 'Abstract generated successfully',
    });
  } catch (err) {
    console.error('[Abstract] Error:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to generate abstract',
    });
  }
};
