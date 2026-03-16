import { Response } from 'express';
import { param, validationResult } from 'express-validator';
import crypto from 'crypto';
import DocumentModel from '../models/Document';
import { analyzeDocument as runAnalysis } from '../services/aiAnalysis';
import { analyzeAIScore, humanizeTextContent } from '../services/ai/aiScoreAnalyzer';
import { structureDocument } from '../services/documentStructure';
import { checkAndIncrementUsage } from '../models/Usage';
import { AuthenticatedRequest } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function applyReplacementOnce(source: string, original: string, replacement: string): {
  text: string;
  applied: boolean;
} {
  if (!original.trim() || !replacement.trim()) return { text: source, applied: false };

  const exactIdx = source.indexOf(original);
  if (exactIdx >= 0) {
    return {
      text: source.slice(0, exactIdx) + replacement + source.slice(exactIdx + original.length),
      applied: true,
    };
  }

  const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const insensitive = new RegExp(escaped, 'i');
  if (insensitive.test(source)) {
    return {
      text: source.replace(insensitive, replacement),
      applied: true,
    };
  }

  // Fuzzy match: normalize whitespace gaps so small formatting differences still match.
  const compact = original.trim().split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  if (compact) {
    const loose = new RegExp(compact, 'i');
    if (loose.test(source)) {
      return {
        text: source.replace(loose, replacement),
        applied: true,
      };
    }
  }

  return { text: source, applied: false };
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
  if (!id) {
    res.status(400).json({ success: false, error: 'Document ID required' });
    return;
  }

  try {
    const { allowed, remaining, retryAfterMs } = await checkAndIncrementUsage(req.user!.userId);
    if (!allowed) {
      const mins = Math.ceil(retryAfterMs / 60_000);
      res.status(429).json({
        success: false,
        error: `Analysis limit reached (10/hour). Try again in ${mins} min.`,
        retryAfterMs,
        remaining: 0,
      });
      return;
    }

    const doc = await DocumentModel.findOne({
      _id: id,
      userId: req.user!.userId,
    }).lean();

    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const newHash = hashText(doc.cleanedText);
    const forceRerun = req.query.force === '1';
    const isCacheHit =
      !forceRerun &&
      doc.contentHash === newHash &&
      doc.analysisRunAt !== null &&
      Date.now() - new Date(doc.analysisRunAt).getTime() < CACHE_TTL_MS &&
      doc.aiScore !== null;

    if (isCacheHit) {
      res.json({
        success: true,
        cached: true,
        remaining,
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

    await DocumentModel.findByIdAndUpdate(id, { status: 'processing' });

    const analysis = await runAnalysis(doc.cleanedText);
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

    res.json({
      success: true,
      cached: false,
      remaining,
      data: {
        documentId: id,
        aiScore: updated?.aiScore,
        aiReasoning: analysis.aiReasoning,
        humanizationTips: analysis.humanizationTips,
        humanizationSuggestions: analysis.humanizationSuggestions,
        claimFlags: analysis.claimFlags,
        grammarScore: updated?.grammarScore,
        grammarIssues: updated?.grammarIssues,
        readabilityScore: updated?.readabilityScore,
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
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Analysis failed',
      });
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
  if (!id) {
    res.status(400).json({ success: false, error: 'Document ID required' });
    return;
  }

  try {
    const doc = await DocumentModel.findOne({
      _id: id,
      userId: req.user!.userId,
    });

    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const sourceText = doc.cleanedText || '';
    if (!sourceText.trim()) {
      res.status(400).json({ success: false, error: 'Document text is empty' });
      return;
    }

    let suggestions = (doc.humanizationSuggestions ?? []).filter((s) =>
      s && typeof s.original === 'string' && typeof s.suggestion === 'string' && s.original.trim() && s.suggestion.trim()
    );

    // If no cached suggestions exist, generate a fresh AI-pass first.
    if (suggestions.length === 0) {
      const aiPass = await analyzeAIScore(sourceText);
      suggestions = (aiPass.humanizationSuggestions ?? []).map((s) => ({
        original: s.original,
        suggestion: s.suggestion,
        reason: s.reason,
      }));
      doc.aiScore = aiPass.aiScore;
      doc.aiReasoning = aiPass.aiReasoning;
      doc.humanizationTips = aiPass.humanizationTips;
      doc.humanizationSuggestions = suggestions;
    }

    if (suggestions.length === 0) {
      res.status(400).json({ success: false, error: 'No AI-like sections were flagged to humanize' });
      return;
    }

    let humanizedText = sourceText;
    const appliedRewrites: Array<{ original: string; replacement: string }> = [];

    for (const item of suggestions) {
      const next = applyReplacementOnce(humanizedText, item.original, item.suggestion);
      if (next.applied) {
        humanizedText = next.text;
        appliedRewrites.push({ original: item.original, replacement: item.suggestion });
      }
    }

    const minExpected = Math.max(1, Math.floor(suggestions.length * 0.4));
    if (appliedRewrites.length < minExpected) {
      // If targeted replacements fail too often, do a full humanization rewrite fallback.
      const fallbackHumanized = await humanizeTextContent(sourceText);
      if (fallbackHumanized && fallbackHumanized.trim().length > 0) {
        humanizedText = fallbackHumanized;
      }
    }

    doc.cleanedText = humanizedText;
    doc.structuredContent = structureDocument(humanizedText);

    // Immediately re-analyze so the user gets an updated AI likelihood after humanization.
    doc.status = 'processing';
    const postAnalysis = await runAnalysis(humanizedText);
    const analyzedAt = new Date();

    doc.contentHash = hashText(humanizedText);
    doc.aiScore = postAnalysis.aiScore;
    doc.aiReasoning = postAnalysis.aiReasoning;
    doc.humanizationTips = postAnalysis.humanizationTips;
    doc.humanizationSuggestions = postAnalysis.humanizationSuggestions;
    doc.grammarScore = postAnalysis.grammarScore;
    doc.grammarIssues = postAnalysis.grammarIssues;
    doc.readabilityScore = postAnalysis.readabilityScore;
    doc.sentenceCount = postAnalysis.sentenceCount;
    doc.readingTimeMinutes = postAnalysis.readingTimeMinutes;
    doc.fleschGradeLevel = postAnalysis.fleschGradeLevel;
    doc.avgSentenceLength = postAnalysis.avgSentenceLength;
    doc.longSentences = postAnalysis.longSentences;
    doc.claimFlags = postAnalysis.claimFlags;
    doc.tone = postAnalysis.tone;
    doc.analysisRunAt = analyzedAt;
    doc.status = 'analyzed';

    await doc.save();

    res.json({
      success: true,
      data: {
        documentId: doc._id.toString(),
        appliedCount: appliedRewrites.length,
        appliedRewrites,
        cleanedText: doc.cleanedText,
        analysis: {
          aiScore: doc.aiScore,
          analyzedAt,
        },
      },
      message: `Humanized text and re-analyzed. Updated AI likelihood: ${doc.aiScore ?? 'N/A'}`,
    });
  } catch (err) {
    console.error('[Humanize] Error:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Humanization failed',
    });
  }
};
