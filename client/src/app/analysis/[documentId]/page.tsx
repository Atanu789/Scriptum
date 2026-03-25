'use client';

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AnalysisPanel from '@/components/AnalysisPanel';
import { useDocument } from '@/hooks/useDocument';
import { useSubscription } from '@/hooks/useSubscription';
import {
  ChevronLeft, Loader2, AlertCircle, Edit3,
  Download, Tv2, Brain, Sparkles, ArrowRight, FileText,
} from 'lucide-react';
import { BorderBeam } from '@/components/ui/border-beam';
import { BackgroundDots } from '@/components/ui/background-dots';
import { Footer } from '@/components/ui/footer';
import ShareMenu from '@/components/ShareMenu';

export default function AnalysisPage() {
  const params = useParams<{ documentId: string }>();
  const {
    document,
    isLoading,
    isAnalyzing,
    isHumanizing,
    humanizeProgress,
    humanizePreviewText,
    error,
    aiLimitedNotice,
    analysis,
    analyze,
    humanize,
  } =
    useDocument(params.documentId);
  const {
    canUseHumanizeText,
    canUseGrammarFix,
    isPremium,
    aiUsed,
    aiLimit,
    aiBlocked,
  } = useSubscription();
  const goPremium = useCallback(() => {
    window.location.href = '/pricing';
  }, []);

  const getIssueLineNumber = useCallback((issue: { offset?: number }) => {
    if (!document?.cleanedText || !Number.isInteger(issue.offset)) return null;
    const safeOffset = Math.max(0, Math.min(issue.offset ?? 0, document.cleanedText.length));
    let line = 1;
    for (let i = 0; i < safeOffset; i++) {
      if (document.cleanedText.charCodeAt(i) === 10) line += 1;
    }
    return line;
  }, [document?.cleanedText]);

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#09090f]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center">
              <Brain className="h-7 w-7 text-indigo-400 animate-pulse" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-indigo-500" />
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-white/25">Loading analysis…</p>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (error || !document) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white dark:bg-[#09090f]">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-base font-medium text-slate-700 dark:text-white/70">
          {error || 'Document not found'}
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/[0.08] px-4 py-2 text-sm font-medium text-slate-600 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#09090f]">
      {/* Ambient top glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-80 opacity-30 dark:opacity-20 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% -5%, rgba(99,102,241,0.45) 0%, transparent 80%)',
        }}
      />

      <main className="relative mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">

        {/* ── Breadcrumb ─────────────────────────────────────────────── */}
        <nav className="mb-8 flex flex-wrap items-center gap-1.5 text-sm">
          <Link
            href="/dashboard"
            className="text-slate-400 dark:text-white/30 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            Dashboard
          </Link>
          <ChevronLeft className="h-3.5 w-3.5 text-slate-300 dark:text-white/20 rotate-180 flex-shrink-0" />
          <Link
            href={`/editor/${params.documentId}`}
            className="text-slate-400 dark:text-white/30 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors truncate max-w-[180px]"
          >
            {document.originalFileName}
          </Link>
          <ChevronLeft className="h-3.5 w-3.5 text-slate-300 dark:text-white/20 rotate-180 flex-shrink-0" />
          <span className="font-medium text-slate-700 dark:text-white/70">Analysis</span>
        </nav>

        {/* ── Premium Hero Header ─────────────────────────────────────── */}
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-indigo-200/50 dark:border-indigo-500/20">
          <BorderBeam duration={10} colorFrom="#6366f1" colorTo="#a78bfa" />

          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-white/60 to-violet-50/60 dark:from-indigo-950/50 dark:via-[#09090f]/60 dark:to-violet-950/30" />

          {/* Dot grid */}
          <BackgroundDots gap={24} dotSize={1} mask={false} className="opacity-30 dark:opacity-50" />

          <div className="relative z-10 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: icon + title */}
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-100/80 dark:border-indigo-500/20 dark:bg-indigo-500/10 px-2.5 py-0.5">
                  <Sparkles className="h-2.5 w-2.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                    AI Analysis
                  </span>
                </div>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
                  Content Analysis
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500 dark:text-white/35">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate max-w-[280px]">{document.originalFileName}</span>
                </p>
              </div>
            </div>

            {/* Right: quick actions */}
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              <ShareMenu title={`${document.originalFileName} - Analysis`} />
              <Link
                href={`/teleprompter/${params.documentId}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.04] backdrop-blur-sm px-3 py-2 text-xs font-medium text-slate-600 dark:text-white/50 hover:bg-white dark:hover:bg-white/[0.07] hover:border-sky-300 dark:hover:border-sky-500/30 transition-all"
              >
                <Tv2 className="h-3.5 w-3.5 text-sky-500" />
                Teleprompter
              </Link>
              <Link
                href={`/export/${params.documentId}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.04] backdrop-blur-sm px-3 py-2 text-xs font-medium text-slate-600 dark:text-white/50 hover:bg-white dark:hover:bg-white/[0.07] hover:border-emerald-300 dark:hover:border-emerald-500/30 transition-all"
              >
                <Download className="h-3.5 w-3.5 text-emerald-500" />
                Export
              </Link>
              <Link
                href={`/editor/${params.documentId}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-indigo-500/30 hover:from-indigo-500 hover:to-violet-500 hover:-translate-y-0.5 transition-all active:scale-[0.97]"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit Document
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {aiLimitedNotice && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
            Free limit reached - showing basic results. {aiLimitedNotice}
          </div>
        )}

        {/* ── Analysis Panel — full-width, expanded ──────────────────── */}
        <AnalysisPanel
          analysis={analysis}
          isAnalyzing={isAnalyzing}
          isHumanizing={isHumanizing}
          analysisProgress={isHumanizing ? humanizeProgress : null}
          streamingPreviewText={humanizePreviewText}
          onAnalyze={analyze}
          onHumanize={canUseHumanizeText ? humanize : undefined}
          onGoPremium={goPremium}
          canUseHumanizeFeature={canUseHumanizeText}
          canUseGrammarFixFeature={canUseGrammarFix}
          canUseToneBiasFeature={isPremium}
          aiUsageLabel={aiLimit === -1 ? `${aiUsed}/∞` : `${aiUsed}/${aiLimit}`}
          isAiUsageBlocked={aiBlocked}
          documentStatus={document.status}
          getGrammarIssueLine={getIssueLineNumber}
          expanded
        />
      </main>

      <Footer />
    </div>
  );
}
