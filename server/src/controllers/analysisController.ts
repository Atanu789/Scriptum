import { Response } from 'express';
import { param, validationResult } from 'express-validator';
import crypto from 'crypto';
import DocumentModel from '../models/Document';
import { analyzeDocument as runAnalysis } from '../services/aiAnalysis';
import {
  analyzeAIScore,
  generateSentenceRewriteSuggestions,
  lengthSimilarity,
  rewriteSingleSentenceWithMode,
  splitIntoSentences,
  validateSentenceRewrite,
} from '../services/ai/aiScoreAnalyzer';
import { htmlToStructuredModel, plainTextToEditorHtml, structureDocument } from '../services/documentStructure';
import { AuthenticatedRequest, HumanizeMode } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

    const mode = resolveHumanizeMode((req.body as { mode?: unknown })?.mode);
    const originalText = sourceText;
    const originalSentences = splitIntoSentences(sourceText);
    if (originalSentences.length === 0) {
      res.status(400).json({ success: false, error: 'Unable to split document into sentences' });
      return;
    }

    const rewrittenSentences = [...originalSentences];
    const rewrittenIndices = new Set<number>();
    const appliedRewrites: Array<{ original: string; replacement: string }> = [];
    const similaritySamples: number[] = [];

    const indexedSuggestions = await generateSentenceRewriteSuggestions(originalSentences, mode);
    for (const item of indexedSuggestions) {
      const idx = item.sentenceIndex;
      if (idx < 0 || idx >= rewrittenSentences.length) continue;

      const originalSentence = originalSentences[idx];
      const rewrittenSentence = item.rewrittenSentence;
      if (!validateSentenceRewrite(originalSentence, rewrittenSentence, mode)) continue;

      rewrittenSentences[idx] = rewrittenSentence;
      rewrittenIndices.add(idx);
      appliedRewrites.push({ original: originalSentence, replacement: rewrittenSentence });
      similaritySamples.push(lengthSimilarity(originalSentence, rewrittenSentence));
    }

    // If targeted suggestions are too sparse, rewrite the rest sentence-by-sentence (no full-document rewrite fallback).
    const expectedRewrites = Math.max(1, Math.floor(originalSentences.length * 0.35));
    if (rewrittenIndices.size < expectedRewrites) {
      for (let i = 0; i < originalSentences.length; i += 1) {
        if (rewrittenIndices.has(i)) continue;
        const rewritten = await rewriteSingleSentenceWithMode(originalSentences[i], mode);
        if (!validateSentenceRewrite(originalSentences[i], rewritten, mode)) continue;
        if (rewritten.trim() === originalSentences[i].trim()) continue;

        rewrittenSentences[i] = rewritten;
        rewrittenIndices.add(i);
        appliedRewrites.push({ original: originalSentences[i], replacement: rewritten });
        similaritySamples.push(lengthSimilarity(originalSentences[i], rewritten));
      }
    }

    // Final sentence-level validation: never allow empty or non-text sentence output.
    for (let i = 0; i < rewrittenSentences.length; i += 1) {
      const candidate = rewrittenSentences[i]?.trim();
      if (!candidate || !/[A-Za-z0-9]/.test(candidate)) {
        rewrittenSentences[i] = originalSentences[i];
      }
    }

    const humanizedText = rebuildTextFromSentences(rewrittenSentences);
    if (!humanizedText || humanizedText.length < Math.max(20, Math.floor(sourceText.length * 0.4))) {
      res.status(500).json({ success: false, error: 'Humanization output validation failed' });
      return;
    }

    doc.cleanedText = humanizedText;
    doc.editorHtml = plainTextToEditorHtml(humanizedText);
    doc.editorModel = htmlToStructuredModel(doc.editorHtml);
    doc.structuredContent = structureDocument(humanizedText);
    doc.lastHumanizeOriginalText = originalText;
    doc.lastHumanizeMode = mode;

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

    const totalSentences = originalSentences.length;
    const rewrittenPercent = Math.round((rewrittenIndices.size / Math.max(1, totalSentences)) * 100);
    const averageLengthSimilarity = similaritySamples.length > 0
      ? Math.round((similaritySamples.reduce((sum, n) => sum + n, 0) / similaritySamples.length) * 100) / 100
      : 1;

    res.json({
      success: true,
      data: {
        documentId: doc._id.toString(),
        appliedCount: appliedRewrites.length,
        totalSentences,
        rewrittenPercent,
        averageLengthSimilarity,
        mode,
        originalText,
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
