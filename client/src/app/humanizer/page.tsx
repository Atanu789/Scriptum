'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { humanizerApi } from '@/lib/api';
import { documentApi } from '@/lib/api';
import type {
  DocumentSummary,
  HumanizerHistoryRecord,
  HumanizerPlans,
  HumanizerProcessResult,
  HumanizerUiMode,
} from '@/types';
import { Loader2, Copy, Save, RotateCcw, Sparkles, History, X, Upload, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

function getWordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function modeLabel(mode: HumanizerUiMode): string {
  if (mode === 'creative') return 'Creative';
  if (mode === 'advanced') return 'Advanced';
  return 'Standard';
}

export default function HumanizerPage() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [mode, setMode] = useState<HumanizerUiMode>('standard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastResult, setLastResult] = useState<HumanizerProcessResult | null>(null);
  const [plans, setPlans] = useState<HumanizerPlans | null>(null);
  const [history, setHistory] = useState<HumanizerHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [aiBusyMessage, setAiBusyMessage] = useState('');
  const [compareView, setCompareView] = useState<'split' | 'original' | 'improved'>('split');

  const inputWords = useMemo(() => getWordCount(inputText), [inputText]);
  const outputWords = useMemo(() => getWordCount(outputText), [outputText]);

  const planForMode = useMemo(() => {
    if (!plans) return null;
    if (mode === 'advanced') return plans.advanced;
    if (mode === 'creative') return plans.pro;
    return plans.free;
  }, [mode, plans]);

  const refreshHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const rows = await humanizerApi.listHistory(20);
      setHistory(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load history';
      setError(msg);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await documentApi.list(1, 50);
      setDocuments(data.documents);
    } catch {
      // Keep UI usable even if document listing fails.
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingPlans(true);
        const planData = await humanizerApi.getPlans();
        setPlans(planData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load plan limits';
        setError(msg);
      } finally {
        setLoadingPlans(false);
      }
    };

    load();
    refreshHistory();
    loadDocuments();
  }, [refreshHistory, loadDocuments]);

  const stripHtml = useCallback((html: string): string => {
    if (typeof window === 'undefined') return html;
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(html || '', 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }, []);

  const handleUseDocument = useCallback(async () => {
    if (!selectedDocumentId) return;
    try {
      const doc = await documentApi.get(selectedDocumentId);
      const content = (doc.cleanedText || '').includes('<') ? stripHtml(doc.cleanedText || '') : (doc.cleanedText || '');
      setInputText(content);
      toast.success('Loaded document text');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load document';
      setError(msg);
      toast.error(msg);
    }
  }, [selectedDocumentId, stripHtml]);

  const handleUploadTextFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      setInputText(text);
      toast.success('Text file loaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read file';
      setError(msg);
      toast.error(msg);
    }
  }, []);

  const runHumanize = useCallback(async (rehumanize = false) => {
    if (!inputText.trim()) {
      toast.error('Paste text to humanize');
      return;
    }

    try {
      setIsProcessing(true);
      setError('');
      setAiBusyMessage('');
      const text = rehumanize && outputText.trim() ? outputText : inputText;
      let attempt = 0;
      let result: HumanizerProcessResult | null = null;
      let lastError: Error | null = null;

      while (attempt < 3 && !result) {
        try {
          result = await humanizerApi.process({ text, mode });
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('AI processing unavailable. Try again shortly.');
          attempt += 1;
          if (attempt < 3) {
            setAiBusyMessage(lastError.message);
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
        }
      }

      if (!result) {
        throw lastError || new Error('AI processing unavailable. Try again shortly.');
      }

      setOutputText(result.humanizedText);
      setLastResult(result);
      toast.success(result.cached ? 'Loaded cached result' : 'Humanized successfully');
      refreshHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI processing unavailable. Try again shortly.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  }, [inputText, mode, outputText, refreshHistory]);

  const handleCopy = useCallback(async () => {
    if (!outputText.trim()) return;
    await navigator.clipboard.writeText(outputText);
    toast.success('Copied output');
  }, [outputText]);

  const handleSave = useCallback(async () => {
    if (!inputText.trim() || !outputText.trim()) {
      toast.error('Nothing to save yet');
      return;
    }

    try {
      setIsSaving(true);
      await humanizerApi.save({ originalText: inputText, humanizedText: outputText, mode });
      toast.success('Saved to history');
      refreshHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [inputText, mode, outputText, refreshHistory]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-[#0b0d14] dark:text-white">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">Premium Humanizer</h1>
              <p className="text-xs text-slate-500 dark:text-white/50">Simple rewrite workflow with plan-based word limits.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => runHumanize(false)}
                disabled={isProcessing || !inputText.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Humanize
              </button>
              <button
                onClick={() => runHumanize(true)}
                disabled={isProcessing || !outputText.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-humanize
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(['standard', 'creative', 'advanced'] as HumanizerUiMode[]).map((item) => (
              <button
                key={item}
                onClick={() => setMode(item)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  mode === item
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/[0.05] dark:text-white/70 dark:hover:bg-white/[0.1]'
                }`}
              >
                {modeLabel(item)}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08]">
              <Upload className="h-3.5 w-3.5" />
              Upload .txt
              <input
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadTextFile(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>

            <select
              value={selectedDocumentId}
              onChange={(e) => setSelectedDocumentId(e.target.value)}
              className="h-8 min-w-[220px] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/75"
            >
              <option value="">Select document</option>
              {documents.map((doc) => (
                <option key={doc._id} value={doc._id}>{doc.originalFileName}</option>
              ))}
            </select>
            <button
              onClick={handleUseDocument}
              disabled={!selectedDocumentId}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
            >
              <FileText className="h-3.5 w-3.5" /> Use document
            </button>
          </div>
        </section>

        {error && (
          <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </section>
        )}

        {aiBusyMessage && (
          <ErrorBanner
            message={aiBusyMessage}
            onRetry={() => {
              setAiBusyMessage('');
              void runHumanize(false);
            }}
            onClose={() => setAiBusyMessage('')}
          />
        )}

        {isProcessing && (
          <section className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI is improving your text...</span>
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Input</p>
              <button
                onClick={() => setInputText('')}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-white/55 dark:hover:bg-white/[0.08]"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste text here..."
              className="h-80 w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-400 dark:border-white/[0.1] dark:bg-[#0f1424] dark:text-white/85"
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-white/45">Words: {inputWords}{planForMode ? ` / ${planForMode.maxWordsPerRequest}` : ''}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Output</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!outputText.trim()}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white/65 dark:hover:bg-white/[0.08]"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                <button
                  onClick={handleSave}
                  disabled={!outputText.trim() || isSaving}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
            </div>
            <textarea
              value={outputText}
              onChange={(e) => setOutputText(e.target.value)}
              placeholder="Humanized text appears here..."
              className="h-80 w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-400 dark:border-white/[0.1] dark:bg-[#0f1424] dark:text-white/85"
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-white/45">Words: {outputWords}</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Before / After</p>
              <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-1 dark:border-white/[0.1] dark:bg-white/[0.04]">
                {(['split', 'original', 'improved'] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setCompareView(view)}
                    className={`rounded px-2 py-1 text-[11px] font-semibold capitalize transition ${
                      compareView === view
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>

            {compareView === 'split' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/70">
                  <p className="mb-1 font-semibold text-slate-500 dark:text-white/45">Before</p>
                  <p className="whitespace-pre-wrap">{inputText || 'No input yet.'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/70">
                  <p className="mb-1 font-semibold text-slate-500 dark:text-white/45">After</p>
                  <p className="whitespace-pre-wrap">{outputText || 'No output yet.'}</p>
                </div>
              </div>
            )}

            {compareView === 'original' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/70">
                <p className="mb-1 font-semibold text-slate-500 dark:text-white/45">Original</p>
                <p className="whitespace-pre-wrap">{inputText || 'No input yet.'}</p>
              </div>
            )}

            {compareView === 'improved' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/70">
                <p className="mb-1 font-semibold text-slate-500 dark:text-white/45">Improved</p>
                <p className="whitespace-pre-wrap">{outputText || 'No output yet.'}</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
            <p className="mb-2 text-sm font-semibold">Word Plans</p>
            <div className="space-y-2 text-xs">
              <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/[0.08]">Free: {loadingPlans ? '...' : plans?.free.maxWordsPerRequest ?? 1000} words</div>
              <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/[0.08]">Pro: {loadingPlans ? '...' : plans?.pro.maxWordsPerRequest ?? 5000} words</div>
              <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/[0.08]">Advanced: {loadingPlans ? '...' : plans?.advanced.maxWordsPerRequest ?? 12000} words</div>
            </div>

            {lastResult && (
              <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                <p>Quality: <span className="font-semibold capitalize">{lastResult.quality}</span></p>
                <p>AI score: <span className="font-semibold">{lastResult.aiLikelihoodScore}</span></p>
                <p>{lastResult.cached ? 'Served from cache' : `Processed in ${lastResult.processingMs ?? 0} ms`}</p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
          <div className="mb-2 flex items-center gap-1.5">
            <History className="h-4 w-4 text-slate-500" />
            <p className="text-sm font-semibold">Saved History</p>
          </div>

          {loadingHistory ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading history...
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-white/45">No saved versions yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item._id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/[0.08]">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-white/45">
                    <span>{modeLabel(item.mode)} • {item.wordCount} words</span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="line-clamp-2 text-xs text-slate-700 dark:text-white/70">{item.humanizedText}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
