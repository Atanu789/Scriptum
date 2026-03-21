import { Response } from 'express';
import { param, validationResult } from 'express-validator';
import crypto from 'crypto';
import DocumentModel from '../models/Document';
import { analyzeDocument as runAnalysis } from '../services/aiAnalysis';
import {
  splitIntoSentences,
} from '../services/ai/aiScoreAnalyzer';
import { callGemini } from '../services/ai/geminiClient';
import { humanizeDocumentText } from '../services/ai/humanizerEngine';
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

function lengthSimilarity(original: string, rewritten: string): number {
  const o = Math.max(1, original.trim().length);
  const r = Math.max(1, rewritten.trim().length);
  const similarity = 1 - Math.abs(o - r) / o;
  return Math.max(0, Math.min(1, similarity));
}

function normalizeAiScore(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
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
    const rawStyleProfile = (req.body as { styleProfile?: unknown })?.styleProfile;
    const styleProfile = rawStyleProfile === 'student'
      || rawStyleProfile === 'journalist'
      || rawStyleProfile === 'casual-speaker'
      || rawStyleProfile === 'academic'
      ? rawStyleProfile
      : undefined;

    const originalText = sourceText;
    const originalSentences = splitIntoSentences(sourceText);
    if (originalSentences.length === 0) {
      res.status(400).json({ success: false, error: 'Unable to split document into sentences' });
      return;
    }

    const engine = await humanizeDocumentText(sourceText, { mode, styleProfile });
    const humanizedText = engine.humanizedText;
    if (!humanizedText || humanizedText.length < Math.max(20, Math.floor(sourceText.length * 0.4))) {
      res.status(500).json({ success: false, error: 'Humanization output validation failed' });
      return;
    }

    const appliedRewrites = engine.appliedRewrites;

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
    const rewrittenPercent = Math.max(0, Math.min(100, Math.round((engine.rewrittenChunkCount / Math.max(1, engine.chunkCount)) * 100)));
    const averageLengthSimilarity = Math.round(lengthSimilarity(originalText, humanizedText) * 100) / 100;

    res.json({
      success: true,
      data: {
        documentId: doc._id.toString(),
        appliedCount: appliedRewrites.length,
        totalSentences,
        rewrittenPercent,
        averageLengthSimilarity,
        mode,
        styleProfile: styleProfile || 'balanced-neutral',
        originalText,
        appliedRewrites: appliedRewrites.slice(0, 200),
        cleanedText: doc.cleanedText,
        aiLikelihoodScore: engine.aiLikelihoodScore,
        quality: engine.quality,
        notes: engine.notes,
        retryCount: engine.retryCount,
        evaluationReason: engine.evaluationReason,
        analysis: {
          aiScore: normalizeAiScore(doc.aiScore, normalizeAiScore(postAnalysis.aiScore, 0)),
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

    const responseText = await callGemini(prompt);
    const parsed = parseAbstractPayload(responseText);

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
