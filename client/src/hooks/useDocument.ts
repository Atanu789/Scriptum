'use client';

import { useState, useEffect, useCallback } from 'react';
import { Document, AnalysisProgress, AnalysisResult, HumanizeResult } from '@/types';
import { documentApi, analysisApi } from '@/lib/api';
import { sanitize, sanitizeContent } from '@/lib/sanitize';
import toast from 'react-hot-toast';

function normalizeAiScore(value: unknown, fallback: number | null = null): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

/** Strip HTML from text fields coming from the API (defense-in-depth). */
function sanitizeDoc(doc: Document): Document {
  return {
    ...doc,
    rawText:          sanitize(doc.rawText),
    cleanedText:      sanitizeContent(doc.cleanedText),   // preserves media HTML from /uploads/
    editorHtml:       sanitizeContent(doc.editorHtml || ''),
    originalFileName: sanitize(doc.originalFileName),
    humanizationTips: doc.humanizationTips?.map(sanitize) ?? [],
    claimFlags:       doc.claimFlags ?? [],
    grammarIssues: doc.grammarIssues?.map((g) => ({
      ...g,
      message:      sanitize(g.message),
      shortMessage: g.shortMessage ? sanitize(g.shortMessage) : g.shortMessage,
      context:      g.context ? sanitize(g.context) : g.context,
      replacements: g.replacements?.map(sanitize),
    })),
  };
}

function sanitizeAnalysis(a: AnalysisResult): AnalysisResult {
  const resolvedTone = a.tone ?? {
    dominantTone: 'neutral',
    confidence: Math.max(0, Math.min(1, (a.toneScore ?? 50) / 100)),
    breakdown: { neutral: 1 },
    biasFlags: [],
  };

  return {
    ...a,
    readabilityScore: a.readabilityScore ?? 0,
    tone: resolvedTone,
    aiReasoning:      a.aiReasoning      ? sanitize(a.aiReasoning) : a.aiReasoning,
    humanizationTips: a.humanizationTips?.map(sanitize),
    claimFlags:       a.claimFlags       ?? [],
    grammarIssues: a.grammarIssues?.map((g) => ({
      ...g,
      message:      sanitize(g.message),
      shortMessage: g.shortMessage ? sanitize(g.shortMessage) : g.shortMessage,
      context:      g.context ? sanitize(g.context) : g.context,
      replacements: g.replacements?.map(sanitize),
    })),
  };
}

interface UseDocumentReturn {
  document: Document | null;
  isLoading: boolean;
  isAnalyzing: boolean;
  isHumanizing: boolean;
  humanizeProgress: AnalysisProgress | null;
  humanizePreviewText: string;
  error: string | null;
  aiLimitedNotice: string | null;
  analysis: AnalysisResult | null;
  refresh: () => Promise<void>;
  analyze: () => Promise<void>;
  humanize: () => Promise<HumanizeResult | null>;
  updateContent: (editorHtml: string, fixedGrammarIssueKeys?: string[]) => Promise<void>;
}

export function useDocument(documentId: string): UseDocumentReturn {
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isHumanizing, setIsHumanizing] = useState(false);
  const [humanizeProgress, setHumanizeProgress] = useState<AnalysisProgress | null>(null);
  const [humanizePreviewText, setHumanizePreviewText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aiLimitedNotice, setAiLimitedNotice] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const refresh = useCallback(async () => {
    if (!documentId) return;
    try {
      setIsLoading(true);
      setError(null);
      const doc = await documentApi.get(documentId);
      setDocument(sanitizeDoc(doc));

      // If document was previously analyzed, reconstruct analysis state from it
      if (doc.analysisRunAt && (doc.grammarScore !== null || doc.readabilityScore !== null)) {
        setAnalysis({
          documentId:       doc._id,
          aiScore:          normalizeAiScore(doc.aiScore, 0),
          grammarScore:     doc.grammarScore     ?? 0,
          readabilityScore: doc.readabilityScore ?? 0,
          grammarIssues:    doc.grammarIssues    ?? [],
          claimFlags:       doc.claimFlags       ?? [],
          longSentences:    doc.longSentences    ?? [],
          humanizationTips: doc.humanizationTips ?? [],
          aiReasoning:      doc.aiReasoning      ?? '',
          tone:             doc.tone             ?? undefined,
          wordCount:        doc.wordCount,
          sentenceCount:    doc.sentenceCount    ?? 0,
          analyzedAt:       doc.analysisRunAt,
        });
      } else {
        setAnalysis(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load document';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const analyze = useCallback(async () => {
    if (!documentId) return;
    setIsAnalyzing(true);
    setError(null);
    setAiLimitedNotice(null);
    const toastId = toast.loading('Running AI analysis…');
    try {
      const result = await analysisApi.analyze(documentId, true);
      let normalizedResult: AnalysisResult = {
        ...result,
        aiScore: normalizeAiScore(result.aiScore, 0),
        readabilityScore: result.readabilityScore ?? 0,
        toneScore: result.toneScore ?? 50,
        tone: result.tone ?? {
          dominantTone: 'neutral',
          confidence: Math.max(0, Math.min(1, (result.toneScore ?? 50) / 100)),
          breakdown: { neutral: 1 },
          biasFlags: [],
        },
      };

      if (!normalizedResult.limited && (normalizedResult.aiScore === null || normalizedResult.aiScore <= 0)) {
        setError('AI temporarily busy, retrying...');
        const retry = await analysisApi.analyze(documentId, true);
        normalizedResult = {
          ...retry,
          aiScore: normalizeAiScore(retry.aiScore, 0),
          readabilityScore: retry.readabilityScore ?? 0,
          toneScore: retry.toneScore ?? 50,
          tone: retry.tone ?? {
            dominantTone: 'neutral',
            confidence: Math.max(0, Math.min(1, (retry.toneScore ?? 50) / 100)),
            breakdown: { neutral: 1 },
            biasFlags: [],
          },
        };
      }

      if (!normalizedResult.limited && (normalizedResult.aiScore === null || normalizedResult.aiScore <= 0)) {
        throw new Error('AI analysis failed. Please retry.');
      }

      console.log('[useDocument] Fresh analysis result. aiScore:', normalizedResult.aiScore);
      setAnalysis(sanitizeAnalysis(normalizedResult));
      if (normalizedResult.limited) {
        const notice = normalizedResult.limitReason || 'Free limit reached - showing basic results.';
        setAiLimitedNotice(notice);
        toast.success('Free limit reached - showing basic results.', { id: toastId });
      } else {
        setAiLimitedNotice(null);
        toast.success('Analysis complete', { id: toastId });
      }
      setError(null);
      // Refresh doc to get updated status
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError('AI analysis failed. Please retry.');
      toast.error(msg, { id: toastId });
      if (typeof window !== 'undefined' && (msg.toLowerCase().includes('ai analysis limit') || msg.toLowerCase().includes('monthly ai analysis limit') || msg.toLowerCase().includes('upgrade to pro'))) {
        window.location.href = '/pricing';
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [documentId, refresh]);

  const humanize = useCallback(async (): Promise<HumanizeResult | null> => {
    if (!documentId) return null;
    setIsHumanizing(true);
    setHumanizeProgress({ step: 0, total: 100, label: 'Starting background humanize job…' });
    setHumanizePreviewText('');
    const toastId = toast.loading('Processing large document in background…');
    try {
      const started = await analysisApi.humanizeStart(documentId);

      let result: HumanizeResult | null = null;
      const maxPoll = 600;
      for (let i = 0; i < maxPoll; i += 1) {
        const status = await analysisApi.humanizeStatus(documentId, started.jobId);
        const pct = Math.max(0, Math.min(100, status.progress ?? 0));
        setHumanizeProgress({
          step: pct,
          total: 100,
          label: `Humanizing chunks ${status.chunksDone}/${status.totalChunks}`,
        });

        if (status.partialText) {
          setHumanizePreviewText(status.partialText);
          setDocument((prev) => prev ? sanitizeDoc({ ...prev, cleanedText: status.partialText || prev.cleanedText }) : prev);
        }

        if (status.status === 'done') {
          result = status.result || null;
          break;
        }

        if (status.status === 'failed') {
          throw new Error(status.error || 'Humanization failed');
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!result) {
        throw new Error('Humanization job timed out while waiting for completion.');
      }

      if (result.limited) {
        setAiLimitedNotice(result.limitReason || 'Free limit reached - showing basic results.');
      }

      await refresh();
      const score = result.analysis?.aiScore;
      const scoreSuffix = typeof score === 'number' ? ` · AI likelihood now ${Math.round(score)}%` : '';
      toast.success(`Humanized ${result.appliedCount} section${result.appliedCount === 1 ? '' : 's'}${scoreSuffix}`, { id: toastId });
      setHumanizeProgress(null);
      setHumanizePreviewText('');
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Humanization failed';
      toast.error(msg, { id: toastId });
      if (typeof window !== 'undefined' && msg.toLowerCase().includes('upgrade')) {
        window.location.href = '/pricing';
      }
      return null;
    } finally {
      setIsHumanizing(false);
      setHumanizeProgress(null);
    }
  }, [documentId, refresh]);

  const updateContent = useCallback(async (editorHtml: string, fixedGrammarIssueKeys?: string[]) => {
    if (!documentId) return;
    try {
      const updated = await documentApi.update(documentId, { editorHtml, fixedGrammarIssueKeys });
      setDocument((prev) => prev ? sanitizeDoc({
        ...prev,
        editorHtml,
        cleanedText: typeof updated.cleanedText === 'string' ? updated.cleanedText : prev.cleanedText,
      } as Document) : prev);

      if ((fixedGrammarIssueKeys?.length ?? 0) > 0) {
        const keys = new Set(fixedGrammarIssueKeys);
        setAnalysis((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            grammarIssues: prev.grammarIssues.map((issue) => {
              const key = `${issue.rule?.id || 'rule'}|${issue.offset}|${issue.length}|${issue.message}`;
              return keys.has(key) ? { ...issue, fixed: true } : issue;
            }),
          };
        });
      }
      toast.success('Document saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(msg);
    }
  }, [documentId]);

  return {
    document,
    isLoading,
    isAnalyzing,
    isHumanizing,
    humanizeProgress,
    humanizePreviewText,
    error,
    aiLimitedNotice,
    analysis,
    refresh,
    analyze,
    humanize,
    updateContent,
  };
}
