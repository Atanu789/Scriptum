import { Response } from 'express';
import { param, validationResult } from 'express-validator';
import crypto from 'crypto';
import DocumentModel from '../models/Document';
import { analyzeDocument as runAnalysis } from '../services/aiAnalysis';
import { checkAndIncrementUsage } from '../models/Usage';
import { AuthenticatedRequest } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
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
