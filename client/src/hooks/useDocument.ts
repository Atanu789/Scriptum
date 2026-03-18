'use client';

import { useState, useEffect, useCallback } from 'react';
import { Document, AnalysisResult, HumanizeResult } from '@/types';
import { documentApi, analysisApi } from '@/lib/api';
import { sanitize, sanitizeContent } from '@/lib/sanitize';
import toast from 'react-hot-toast';

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
  return {
    ...a,
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
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);
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
          aiScore:          doc.aiScore         ?? null,
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
    const toastId = toast.loading('Running AI analysis…');
    try {
      const result = await analysisApi.analyze(documentId, true);
      console.log('[useDocument] Fresh analysis result. aiScore:', result.aiScore);
      setAnalysis(sanitizeAnalysis(result));
      toast.success('Analysis complete', { id: toastId });
      // Refresh doc to get updated status
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
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
    const toastId = toast.loading('Humanizing AI-like sections…');
    try {
      const result = await analysisApi.humanize(documentId);
      await refresh();
      const score = result.analysis?.aiScore;
      const scoreSuffix = typeof score === 'number' ? ` · AI likelihood now ${Math.round(score)}%` : '';
      toast.success(`Humanized ${result.appliedCount} section${result.appliedCount === 1 ? '' : 's'}${scoreSuffix}`, { id: toastId });
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
    error,
    analysis,
    refresh,
    analyze,
    humanize,
    updateContent,
  };
}
