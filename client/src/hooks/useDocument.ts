'use client';

import { useState, useEffect, useCallback } from 'react';
import { Document, AnalysisResult } from '@/types';
import { documentApi, analysisApi } from '@/lib/api';
import { sanitize } from '@/lib/sanitize';
import toast from 'react-hot-toast';

/** Strip HTML from text fields coming from the API (defense-in-depth). */
function sanitizeDoc(doc: Document): Document {
  return {
    ...doc,
    rawText:          sanitize(doc.rawText),
    cleanedText:      sanitize(doc.cleanedText),
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
  error: string | null;
  analysis: AnalysisResult | null;
  refresh: () => Promise<void>;
  analyze: () => Promise<void>;
  updateContent: (cleanedText: string) => Promise<void>;
}

export function useDocument(documentId: string): UseDocumentReturn {
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
    } finally {
      setIsAnalyzing(false);
    }
  }, [documentId, refresh]);

  const updateContent = useCallback(async (cleanedText: string) => {
    if (!documentId) return;
    try {
      await documentApi.update(documentId, { cleanedText });
      setDocument((prev) => prev ? { ...prev, cleanedText } : prev);
      toast.success('Document saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(msg);
    }
  }, [documentId]);

  return { document, isLoading, isAnalyzing, error, analysis, refresh, analyze, updateContent };
}
