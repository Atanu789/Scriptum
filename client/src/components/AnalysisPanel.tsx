'use client';

import { AnalysisResult, GrammarIssue, AnalysisProgress } from '@/types';
import { cn, grammarScoreLabel } from '@/lib/utils';
import {
  Loader2, AlertTriangle, CheckCircle2, Lightbulb, BookOpen,
  XCircle, AlertCircle, Info,
  RefreshCw, Brain, Gauge, Sparkles, X, Bot, Shield,
  ScanSearch, Save, FileCheck2, Hash, Clock, BarChart3, Mic2,
  AlertOctagon, Eye, Activity, Wand2, Copy, Check, ArrowRight,
  Crown, Lock, RotateCcw,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import AILikelihoodCard, { calculateLikelihoodBreakdown } from '@/components/AILikelihoodCard';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  analysis:              AnalysisResult | null;
  isAnalyzing:           boolean;
  isHumanizing?:         boolean;
  analysisProgress?:     AnalysisProgress | null;
  onAnalyze:             () => void;
  onHumanize?:           () => void;
  onGoPremium?:          () => void;
  canUseGrammarFixFeature?: boolean;
  canUseHumanizeFeature?: boolean;
  canUseToneBiasFeature?: boolean;
  aiUsageLabel?:         string;
  isAiUsageBlocked?:     boolean;
  onCancelAnalyze?:      () => void;
  onSave?:               () => void;
  onApplySuggestion?:    (original: string, replacement: string) => void;
  onApplyGrammarFix?:    (issue: GrammarIssue, replacement: string) => void;
  onUndoGrammarFix?:     () => void;
  canUndoGrammarFix?:    boolean;
  getGrammarIssueLine?:  (issue: GrammarIssue) => number | null;
  documentStatus:        string;
  expanded?:             boolean;
  streamingPreviewText?: string;
  documentText?:         string;
}

// ─── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({
  value, label, sublabel, size = 'md', isDark, inverted = false,
}: {
  value:     number;
  label:     string;
  sublabel?: string;
  size?:    'sm' | 'md' | 'lg';
  isDark:    boolean;
  inverted?: boolean;
}) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(Math.min(100, Math.max(0, value))), 100);
    return () => clearTimeout(t);
  }, [value]);

  const cfgs = { sm: { r: 20, dim: 48, sw: 4 }, md: { r: 26, dim: 60, sw: 5 }, lg: { r: 34, dim: 76, sw: 6 } };
  const { r, dim, sw } = cfgs[size];
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - animated / 100);
  const track  = isDark ? '#1e293b' : '#e2e8f0';

  const arc = inverted
    ? value >= 70 ? '#ef4444' : value >= 40 ? '#f59e0b' : '#22c55e'
    : value >= 75 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444';

  const text = inverted
    ? value >= 70 ? 'text-red-500' : value >= 40 ? 'text-amber-500' : 'text-green-500'
    : value >= 75 ? 'text-green-500' : value >= 50 ? 'text-amber-500' : 'text-red-500';

  const ts = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={cn('relative', size === 'lg' ? 'h-[76px] w-[76px]' : size === 'sm' ? 'h-12 w-12' : 'h-[60px] w-[60px]')}>
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${dim} ${dim}`}>
          <circle cx={dim/2} cy={dim/2} r={r} fill="none" strokeWidth={sw} stroke={track} />
          <circle cx={dim/2} cy={dim/2} r={r} fill="none" strokeWidth={sw} stroke={arc}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }} />
        </svg>
        <span className={cn('absolute inset-0 flex items-center justify-center font-bold', ts, text)}>
          {value < 0 ? '—' : `${Math.round(value)}`}
        </span>
      </div>
      <p className={cn('text-center text-xs font-semibold', isDark ? 'text-slate-200' : 'text-slate-700')}>{label}</p>
      {sublabel && <p className="text-center text-[10px] text-slate-500">{sublabel}</p>}
    </div>
  );
}

// ─── Progress Screen ───────────────────────────────────────────────────────────

function ProgressScreen({ progress, onCancel, isDark }: { progress: AnalysisProgress; onCancel?: () => void; isDark: boolean }) {
  const pct = progress.total > 0 ? Math.round((progress.step / progress.total) * 100) : 0;
  const r   = 52; const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const steps = [
    'Extracting document text', 'Running grammar check', 'Computing grammar score',
    'Running Gemini editorial analysis', 'Computing readability', 'Detecting long sentences', 'Finalising',
  ];
  return (
     <div className="card-premium p-8 flex flex-col items-center gap-8">
      <div className="relative h-[120px] w-[120px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="8" stroke={isDark ? '#1e1b4b' : '#e0e7ff'} />
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="8" stroke="url(#pGrad)"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
          <defs><linearGradient id="pGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#a78bfa" />
          </linearGradient></defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-2xl font-black', isDark ? 'text-white' : 'text-slate-900')}>{pct}%</span>
          <span className="text-[10px] text-slate-500">complete</span>
        </div>
      </div>
      <div className="text-center">
        <p className={cn('text-base font-bold flex items-center gap-2 justify-center', isDark ? 'text-white' : 'text-slate-900')}>
          <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" />{progress.label}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">Step {progress.step} of {progress.total}</p>
      </div>
      <div className="w-full space-y-1.5 max-w-xs">
        {steps.slice(0, progress.total).map((step, i) => {
          const done = i < progress.step; const active = i === progress.step;
          return (
            <div key={step} className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-all',
              done   ? (isDark ? 'bg-indigo-950/40 text-indigo-300' : 'bg-indigo-50 text-indigo-600')
              : active ? (isDark ? 'bg-indigo-900/30 text-white'    : 'bg-indigo-100 text-indigo-800')
              :           (isDark ? 'text-slate-600'                 : 'text-slate-300'))}>
              {done   ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
              : active ? <Loader2     className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400 animate-spin" />
              :           <div className={cn('h-3.5 w-3.5 rounded-full border flex-shrink-0', isDark ? 'border-slate-700' : 'border-slate-300')} />}
              {step}
            </div>
          );
        })}
      </div>
      <div className={cn('w-full rounded-full h-1.5', isDark ? 'bg-slate-800' : 'bg-slate-200')}>
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
          style={{ width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
      {onCancel && (
        <button onClick={onCancel} className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
          isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-950/30' : 'text-slate-500 hover:text-red-600 hover:bg-red-50')}>
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      )}
    </div>
  );
}

// ─── Humanization Suggestion Card ────────────────────────────────────────────

function HumanizationCard({
  original, suggestion, reason, index, isDark, onApply,
}: {
  original:   string;
  suggestion: string;
  reason:     string;
  index:      number;
  isDark:     boolean;
  onApply?:   (original: string, suggestion: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(suggestion).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden',
      isDark ? 'border-indigo-900/40 bg-[#0d0d1a]' : 'border-indigo-200 bg-white',
    )}>
      {/* Header */}
      <div className={cn('px-3 py-2 flex items-center gap-2 border-b',
        isDark ? 'bg-indigo-950/40 border-indigo-900/30' : 'bg-indigo-50 border-indigo-100')}>
        <span className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
          isDark ? 'bg-indigo-700 text-white' : 'bg-indigo-600 text-white')}>{index + 1}</span>
        <span className={cn('text-[10px] font-bold uppercase tracking-widest', isDark ? 'text-indigo-300' : 'text-indigo-600')}>AI-sounding passage</span>
      </div>

      <div className="space-y-0">
        {/* Original */}
        <div className={cn('px-3 py-2.5 border-b', isDark ? 'border-slate-800' : 'border-slate-100')}>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-red-500">Original</p>
          <p className={cn('text-xs leading-relaxed italic', isDark ? 'text-slate-300' : 'text-slate-600')}>
            &ldquo;{original}&rdquo;
          </p>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center py-1">
          <ArrowRight className="h-3.5 w-3.5 text-indigo-400" />
        </div>

        {/* Suggestion */}
        <div className={cn('px-3 py-2.5 border-t', isDark ? 'border-slate-800' : 'border-slate-100')}>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-emerald-500">Suggested (Human)</p>
          <p className={cn('text-xs leading-relaxed font-medium', isDark ? 'text-emerald-200' : 'text-emerald-800')}>
            &ldquo;{suggestion}&rdquo;
          </p>
        </div>

        {/* Reason */}
        {reason && (
          <div className={cn('px-3 pb-2 pt-1', isDark ? 'text-slate-500' : 'text-slate-400')}>
            <p className="text-[10px] leading-relaxed">{reason}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={cn('px-3 py-2 flex gap-2 border-t', isDark ? 'border-slate-800' : 'border-slate-100')}>
        <button
          onClick={handleCopy}
          className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
            isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        {onApply && (
          <button
            onClick={() => onApply(original, suggestion)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:from-indigo-500 hover:to-violet-500 transition-all"
          >
            <Wand2 className="h-3.5 w-3.5" /> Apply in Editor
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Grammar Issue Card ───────────────────────────────────────────────────────

const sevCfg = {
  error:      { label: 'Error',      Icon: XCircle,     cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800' },
  warning:    { label: 'Warning',    Icon: AlertCircle, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800' },
  suggestion: { label: 'Suggestion', Icon: Info,        cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800' },
} as const;

function GrammarIssueCard({
  issue,
  isDark,
  onApplyGrammarFix,
  onGoPremium,
  canUseGrammarFix,
  lineNumber,
}: {
  issue: GrammarIssue;
  isDark: boolean;
  onApplyGrammarFix?: (issue: GrammarIssue, replacement: string) => void;
  onGoPremium?: () => void;
  canUseGrammarFix?: boolean;
  lineNumber?: number | null;
}) {
  const sev = (issue.severity ?? 'warning') as keyof typeof sevCfg;
  const { label, Icon: SevIcon, cls } = sevCfg[sev] ?? sevCfg.warning;
  const topReplacement = issue.replacements?.[0]?.trim();
  const grammarFixEnabled = canUseGrammarFix ?? Boolean(onApplyGrammarFix);
  const canQuickFix = grammarFixEnabled && !!onApplyGrammarFix && !!topReplacement && !issue.fixed;
  const showPremiumFix = !grammarFixEnabled && !!onGoPremium && !issue.fixed;
  const lineTag = lineNumber && lineNumber > 0 ? `Line ${lineNumber}` : 'Line ?';

  return (
    <div className={cn('rounded-xl border p-3',
      sev === 'error'      ? (isDark ? 'border-red-900/40 bg-red-950/20'    : 'border-red-100 bg-red-50/40')
      : sev === 'suggestion' ? (isDark ? 'border-blue-900/40 bg-blue-950/20'  : 'border-blue-100 bg-blue-50/40')
      :                         (isDark ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-100 bg-amber-50/40'))}>
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', isDark ? 'bg-indigo-950/60 text-indigo-300' : 'bg-indigo-50 text-indigo-700')}>
              {lineTag}
            </span>
            <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
              <SevIcon className="h-3 w-3" /> {label}
            </span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500')}>
              {issue.rule.category}
            </span>
            {issue.fixed && (
              <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium', isDark ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-800' : 'bg-emerald-50 text-emerald-700 border border-emerald-200')}>
                <CheckCircle2 className="h-3 w-3" /> Fixed
              </span>
            )}
          </div>
          <p className={cn('text-sm font-medium leading-snug', isDark ? 'text-slate-100' : 'text-slate-800')}>
            {issue.shortMessage || issue.message}
          </p>
          {topReplacement && !issue.fixed && (
            <p className={cn('mt-1 text-xs', isDark ? 'text-slate-300' : 'text-slate-600')}>
              <span className={cn('font-semibold', isDark ? 'text-slate-200' : 'text-slate-700')}>Fix:</span> {topReplacement}
            </p>
          )}
        </div>
        {canQuickFix && (
          <button
            type="button"
            onClick={() => onApplyGrammarFix?.(issue, topReplacement!)}
            className="ml-2 inline-flex items-center rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500 transition-colors"
            title={`Apply: ${topReplacement}`}
          >
            Fix
            <span className="ml-1 rounded bg-emerald-500/70 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide">
              Premium
            </span>
          </button>
        )}
        {showPremiumFix && (
          <button
            type="button"
            onClick={onGoPremium}
            className={cn(
              'ml-2 inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold transition-colors',
              isDark
                ? 'bg-amber-500 text-white hover:bg-amber-400'
                : 'bg-amber-500 text-white hover:bg-amber-400',
            )}
            title="Upgrade to Premium to apply grammar fixes"
          >
            <Lock className="mr-1 h-3 w-3" />
            Fix
            <span className="ml-1 rounded bg-amber-400/80 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Premium
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, label, isDark }: { icon: React.ElementType; label: string; isDark: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
      <p className={cn('text-[10px] font-bold uppercase tracking-widest', isDark ? 'text-slate-400' : 'text-slate-500')}>{label}</p>
    </div>
  );
}

function Hr({ isDark }: { isDark: boolean }) {
  return <div className={cn('h-px', isDark ? 'bg-slate-800' : 'bg-slate-100')} />;
}

// ─── Tab type ──────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'integrity' | 'language' | 'tone';

// ─── Main Component ────────────────────────────────────────────────────────────

function AnalysisPanel({
  analysis, isAnalyzing, isHumanizing = false, analysisProgress, onAnalyze, onHumanize, onGoPremium, canUseGrammarFixFeature, canUseHumanizeFeature, canUseToneBiasFeature, aiUsageLabel, isAiUsageBlocked, onCancelAnalyze, onSave, documentStatus, expanded = false,
  streamingPreviewText = '',
  onApplySuggestion, onApplyGrammarFix, onUndoGrammarFix, canUndoGrammarFix = false, getGrammarIssueLine,
  documentText = '',
}: Props) {
  const { theme } = useTheme();
  const D = theme === 'dark';

  const card = cn(
    'relative overflow-hidden rounded-3xl border backdrop-blur-xl',
    D
      ? 'border-white/10 bg-slate-950/70 shadow-[0_20px_45px_-25px_rgba(129,140,248,0.45)]'
      : 'border-slate-200/80 bg-white/85 shadow-[0_20px_45px_-30px_rgba(79,70,229,0.35)]',
  );
  const sub  = cn(
    'rounded-2xl border p-4 backdrop-blur-sm',
    D ? 'border-white/10 bg-slate-900/50' : 'border-white bg-white/80',
  );

  const [activeTab,    setActiveTab]    = useState<TabId>('integrity');

  // ── Derived values ──────────────────────────────────────────────────────────

  const aiScore       = analysis?.aiScore           ?? -1;
  const isQuotaError  = analysis?.aiReasoning?.includes('quota') || analysis?.aiReasoning?.includes('Quota');
  const grammarScore  = analysis?.grammarScore       ?? 0;
  const toneConf      = analysis?.tone?.confidence != null ? Math.round(analysis.tone.confidence * 100) : 0;
  const dominantTone  = analysis?.tone?.dominantTone ?? '—';
  const issueCount    = analysis?.grammarIssues?.length ?? 0;
  const humanizationSuggestions = analysis?.humanizationSuggestions ?? [];
  const biasFlags     = analysis?.tone?.biasFlags ?? [];
  const likelihoodBreakdown = useMemo(() => {
    if (aiScore < 0) return null;
    return calculateLikelihoodBreakdown(aiScore);
  }, [aiScore]);

  const aiVerdict =
    aiScore >= 70 ? 'High AI-generated signal'
    : aiScore >= 40 ? 'Mixed human/AI signal'
    : aiScore >= 0  ? 'Mostly human-written signal'
    : '—';
  const humanizeEnabled = canUseHumanizeFeature ?? Boolean(onHumanize);
  const grammarFixEnabled = canUseGrammarFixFeature ?? Boolean(onApplyGrammarFix);
  const toneBiasEnabled = canUseToneBiasFeature ?? true;
  const analyzeBlocked = Boolean(isAiUsageBlocked);
  const canHumanize = humanizeEnabled && !isAnalyzing && !isHumanizing && !!onHumanize && (humanizationSuggestions.length > 0 || aiScore >= 40);

  const sortedIssues = useMemo(() => {
    if (!analysis?.grammarIssues) return [];
    const order: Record<string,number> = { error: 0, warning: 1, suggestion: 2 };
    return [...analysis.grammarIssues].sort((a, b) =>
      (order[a.severity ?? 'warning'] ?? 1) - (order[b.severity ?? 'warning'] ?? 1)
        || (a.message || '').localeCompare(b.message || ''));
  }, [analysis]);

  const errorCount      = useMemo(() => analysis?.grammarIssues?.filter((i) => i.severity === 'error').length      ?? 0, [analysis]);
  const warningCount    = useMemo(() => analysis?.grammarIssues?.filter((i) => i.severity === 'warning').length    ?? 0, [analysis]);
  const suggestionCount = useMemo(() => analysis?.grammarIssues?.filter((i) => i.severity === 'suggestion').length ?? 0, [analysis]);

  // ── Loading states ──────────────────────────────────────────────────────────

  if ((isAnalyzing || isHumanizing) && analysisProgress) return <ProgressScreen progress={analysisProgress} onCancel={onCancelAnalyze} isDark={D} />;
        {isHumanizing && streamingPreviewText && (
          <div className={cn('mb-5 rounded-xl border p-3', D ? 'border-indigo-900/50 bg-indigo-950/20' : 'border-indigo-200 bg-indigo-50/70')}>
            <p className={cn('mb-1 text-[10px] font-bold uppercase tracking-wider', D ? 'text-indigo-300' : 'text-indigo-700')}>
              Live Humanize Preview
            </p>
            <p className={cn('line-clamp-6 text-xs leading-relaxed', D ? 'text-slate-200' : 'text-slate-700')}>
              {streamingPreviewText}
            </p>
          </div>
        )}

  if (isAnalyzing) return (
    <div className={cn('rounded-2xl border overflow-hidden', D ? 'bg-[#0f0f1a] border-indigo-900/40' : 'bg-white border-indigo-100')}>
      <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 bg-[length:200%_100%] animate-[shimmer_1.5s_linear_infinite]" />
      <div className="flex flex-col items-center gap-6 py-10 px-6">
        <div className="relative">
          <div className={cn('h-16 w-16 rounded-2xl flex items-center justify-center', D ? 'bg-indigo-950/60' : 'bg-indigo-50')}>
            <Brain className="h-8 w-8 text-indigo-400 animate-pulse" />
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-indigo-500" />
          </span>
        </div>
        <div className="text-center space-y-1.5">
          <p className={cn('text-base font-bold', D ? 'text-white' : 'text-slate-900')}>Analysing your document…</p>
          <p className="text-xs text-slate-500">Grammar · AI detection · Claim flags · Tone &amp; bias</p>
        </div>
        <div className="w-full space-y-3 max-w-sm">
          {['Grammar Check', 'AI Detection', 'Claim Analysis', 'Tone & Bias'].map((lbl, i) => (
            <div key={lbl} className={cn('rounded-xl border p-3 flex items-center gap-3', D ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50')}>
              <div className={cn('h-8 w-8 rounded-lg flex-shrink-0 animate-pulse', D ? 'bg-slate-800' : 'bg-slate-200')} style={{ animationDelay: `${i * 0.15}s` }} />
              <div className="flex-1 space-y-1.5">
                <div className={cn('h-2.5 rounded-full animate-pulse', D ? 'bg-slate-700' : 'bg-slate-200')} style={{ width: `${55 + i * 10}%`, animationDelay: `${i * 0.15}s` }} />
                <div className={cn('h-2 rounded-full animate-pulse',   D ? 'bg-slate-800' : 'bg-slate-100')} style={{ width: '40%',              animationDelay: `${i * 0.15 + 0.1}s` }} />
              </div>
              <Loader2 className="h-4 w-4 flex-shrink-0 text-indigo-400 animate-spin" />
            </div>
          ))}
        </div>
        {onCancelAnalyze && (
          <button onClick={onCancelAnalyze} className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            D ? 'text-slate-400 hover:text-red-400 hover:bg-red-950/30' : 'text-slate-500 hover:text-red-600 hover:bg-red-50')}>
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        )}
      </div>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );

  if (!analysis) return (
    <div className={cn('rounded-2xl border flex flex-col items-center justify-center gap-6 py-16 text-center', D ? 'bg-[#0f0f1a] border-slate-800' : 'bg-white border-slate-100')}>
      <div className={cn('h-16 w-16 rounded-2xl flex items-center justify-center', D ? 'bg-indigo-950/60' : 'bg-indigo-50')}>
        <Brain className="h-8 w-8 text-indigo-400" />
      </div>
      <div>
        <p className={cn('text-lg font-bold', D ? 'text-white' : 'text-slate-900')}>No analysis yet</p>
        <p className="mt-1 text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
          Run the editorial analyser to assess credibility, grammar, tone, and publish-readiness.
        </p>
      </div>
      <button onClick={onAnalyze} className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 transition-all shadow-sm">
        <Sparkles className="h-4 w-4" /> Run Analysis
      </button>
    </div>
  );

  // ── Tabs ────────────────────────────────────────────────────────────────────

  const tabs: Array<{ id: TabId; label: string; icon: React.ElementType; badge?: number | string; locked?: boolean }> = [
    { id: 'integrity', label: 'Humanize',           icon: Wand2 },
    { id: 'language',  label: 'Language',            icon: AlertTriangle, badge: issueCount         },
    { id: 'tone',      label: 'Tone & Bias',         icon: Activity,      badge: toneBiasEnabled ? biasFlags.length : 'Premium', locked: !toneBiasEnabled },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl p-1">
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -left-20 -top-16 h-56 w-56 rounded-full blur-3xl',
          D ? 'bg-indigo-500/20 animate-[auroraShift_9s_ease-in-out_infinite]' : 'bg-cyan-300/35 animate-[auroraShift_9s_ease-in-out_infinite]',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -bottom-20 -right-16 h-60 w-60 rounded-full blur-3xl',
          D ? 'bg-fuchsia-500/20 animate-[auroraShift_11s_ease-in-out_infinite_reverse]' : 'bg-violet-300/35 animate-[auroraShift_11s_ease-in-out_infinite_reverse]',
        )}
      />
      <div className="relative z-10 space-y-4">
      {isHumanizing && streamingPreviewText && (
        <div className={cn('rounded-2xl border px-4 py-3 backdrop-blur-sm', D ? 'border-indigo-400/30 bg-indigo-950/35' : 'border-cyan-300/70 bg-cyan-50/80')}>
          <p className={cn('mb-1 text-[10px] font-bold uppercase tracking-wider', D ? 'text-indigo-300' : 'text-indigo-700')}>
            Live Humanize Preview
          </p>
          <p className={cn('line-clamp-6 text-xs leading-relaxed', D ? 'text-slate-200' : 'text-slate-700')}>
            {streamingPreviewText}
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className={cn(card, 'sticky top-2 z-20 p-2.5')}>
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => (tab.locked ? onGoPremium?.() : setActiveTab(tab.id))}
              type="button"
              className={cn('group relative flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-[0_10px_25px_-10px_rgba(14,165,233,0.9)] ring-1 ring-white/30'
                  : D ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900')}>
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  activeTab === tab.id ? 'bg-white/20 text-white' : (D ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'))}>
                  {tab.badge}
                </span>
              )}
              {typeof tab.badge === 'string' && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  activeTab === tab.id ? 'bg-white/20 text-white' : (D ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-700'))}>
                  <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />{tab.badge}</span>
                </span>
              )}
              <span className={cn('pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity', activeTab === tab.id ? 'opacity-100' : 'group-hover:opacity-100', D ? 'bg-white/5' : 'bg-indigo-50/70')} />
            </button>
          ))}
        </div>
      </div>

      {/* ───────────────────────── TAB 1: OVERVIEW ──────────────────────────── */}
      {activeTab === 'overview' && (
        <div className={cn(card, 'p-5 space-y-6 animate-[panelFade_.24s_ease-out]')}>

          <div>
            <SectionLabel icon={Bot} label="Humanize Snapshot" isDark={D} />
            {likelihoodBreakdown ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className={cn('rounded-xl border p-3', D ? 'border-green-900/40 bg-green-950/20' : 'border-green-200 bg-green-50')}>
                  <p className={cn('text-[10px] font-bold uppercase tracking-wider', D ? 'text-green-300' : 'text-green-700')}>Human-written</p>
                  <p className={cn('mt-1 text-2xl font-black', D ? 'text-green-200' : 'text-green-800')}>{likelihoodBreakdown.humanPercentage}%</p>
                </div>
                <div className={cn('rounded-xl border p-3', D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')}>
                  <p className={cn('text-[10px] font-bold uppercase tracking-wider', D ? 'text-amber-300' : 'text-amber-700')}>Mixed</p>
                  <p className={cn('mt-1 text-2xl font-black', D ? 'text-amber-200' : 'text-amber-800')}>{likelihoodBreakdown.mixedPercentage}%</p>
                </div>
                <div className={cn('rounded-xl border p-3', D ? 'border-red-900/40 bg-red-950/20' : 'border-red-200 bg-red-50')}>
                  <p className={cn('text-[10px] font-bold uppercase tracking-wider', D ? 'text-red-300' : 'text-red-700')}>AI-generated</p>
                  <p className={cn('mt-1 text-2xl font-black', D ? 'text-red-200' : 'text-red-800')}>{likelihoodBreakdown.aiPercentage}%</p>
                </div>
              </div>
            ) : (
              <div className={cn('rounded-xl border p-3 text-xs', D ? 'border-slate-800 bg-slate-900/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                Run analysis to view the Human-written, Mixed, and AI-generated split.
              </div>
            )}
          </div>

          <div>
            <SectionLabel icon={BarChart3} label="Editorial Scores" isDark={D} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
              <ScoreRing value={grammarScore} label="Grammar" sublabel={grammarScoreLabel(grammarScore)} isDark={D} />
              <ScoreRing value={toneConf} label="Tone Confidence" isDark={D} />
            </div>
          </div>

          <Hr isDark={D} />

          {/* Quick Status Row */}
          <div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => setActiveTab('integrity')}
              className={cn('rounded-xl border p-3 text-left transition-all hover:shadow-sm active:scale-[0.99]',
              isQuotaError ? (D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')
              : aiScore >= 70 ? (D ? 'border-red-900/40 bg-red-950/20'    : 'border-red-200 bg-red-50')
              : aiScore >= 40 ? (D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')
              :                  (D ? 'border-green-900/40 bg-green-950/20' : 'border-green-200 bg-green-50'))}
              title="Open Humanize"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-lg', D ? 'bg-slate-900/60' : 'bg-white/70')}>
                  <Bot className={cn('h-4 w-4', isQuotaError ? 'text-amber-400' : aiScore >= 70 ? 'text-red-400' : aiScore >= 40 ? 'text-amber-400' : 'text-green-400')} />
                </span>
                <p className="text-[11px] font-bold text-slate-500">Humanize</p>
              </div>
              <p className={cn('text-sm font-semibold',
                isQuotaError ? (D ? 'text-amber-300' : 'text-amber-700')
                : aiScore >= 70 ? (D ? 'text-red-300' : 'text-red-700') : aiScore >= 40 ? (D ? 'text-amber-300' : 'text-amber-700') : (D ? 'text-green-300' : 'text-green-700'))}>
                {isQuotaError ? 'Unavailable' : likelihoodBreakdown ? `AI-generated ${likelihoodBreakdown.aiPercentage}%` : aiVerdict}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">See Human-written/Mixed/AI-generated data and run Humanize.</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('language')}
              className={cn('rounded-xl border p-3 text-left transition-all hover:shadow-sm active:scale-[0.99]',
              grammarScore >= 80 ? (D ? 'border-green-900/40 bg-green-950/20'  : 'border-green-200 bg-green-50')
              : grammarScore >= 55 ? (D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')
              :                       (D ? 'border-red-900/40 bg-red-950/20'    : 'border-red-200 bg-red-50'))}
              title="Open Language"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-lg', D ? 'bg-slate-900/60' : 'bg-white/70')}>
                  <FileCheck2 className={cn('h-4 w-4', grammarScore >= 80 ? 'text-green-400' : grammarScore >= 55 ? 'text-amber-400' : 'text-red-400')} />
                </span>
                <p className="text-[11px] font-bold text-slate-500">Grammar</p>
              </div>
              <p className={cn('text-sm font-semibold',
                grammarScore >= 80 ? (D ? 'text-green-300' : 'text-green-700') : grammarScore >= 55 ? (D ? 'text-amber-300' : 'text-amber-700') : (D ? 'text-red-300' : 'text-red-700'))}>
                {issueCount === 0 ? 'Clean' : `${issueCount} issue${issueCount !== 1 ? 's' : ''}`}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Review errors, warnings, and quick fixes.</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tone')}
              className={cn('rounded-xl border p-3 text-left transition-all hover:shadow-sm active:scale-[0.99]', D ? 'border-indigo-900/40 bg-indigo-950/20' : 'border-indigo-200 bg-indigo-50')}
              title="Open Tone & Bias"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-lg', D ? 'bg-slate-900/60' : 'bg-white/70')}>
                  <Mic2 className="h-4 w-4 text-indigo-400" />
                </span>
                <p className="text-[11px] font-bold text-slate-500">Dominant Tone</p>
              </div>
              <p className={cn('text-sm font-semibold capitalize', D ? 'text-indigo-300' : 'text-indigo-700')}>{dominantTone}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Inspect tone balance and bias indicators.</p>
            </button>
          </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={analyzeBlocked ? onGoPremium : onAnalyze}
              className={cn('flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all border',
                analyzeBlocked
                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : D
                  ? 'border-indigo-800/50 text-indigo-400 hover:bg-indigo-950/50'
                  : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50')}
            >
              {analyzeBlocked ? <Lock className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {analyzeBlocked ? 'AI Limit Reached - Go Premium' : 'Re-run'}
            </button>
            {onSave && (
              <button onClick={onSave} className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 shadow-sm transition-all">
                <Save className="h-4 w-4" /> Save
              </button>
            )}
          </div>
          {aiUsageLabel && (
            <p className={cn('text-center text-[11px]', analyzeBlocked ? 'text-amber-500' : 'text-slate-500')}>
              AI analysis usage: {aiUsageLabel}
            </p>
          )}
        </div>
      )}

      {/* ───────────────────────── TAB 2: HUMANIZE ───────────────────────── */}
      {activeTab === 'integrity' && (
        <div className={cn(card, 'p-5 space-y-6 animate-[panelFade_.24s_ease-out]')}>

          <div>
            <SectionLabel icon={Wand2} label="Humanize Snapshot" isDark={D} />
            {aiScore >= 0 ? (
              <AILikelihoodCard
                aiScore={aiScore}
                showDetectors={true}
                className={cn('shadow-none', D ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-white/95')}
              />
            ) : (
              <div className={cn('rounded-xl border p-4 text-xs leading-relaxed', D ? 'border-slate-800 bg-slate-900/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                AI detection snapshot is unavailable right now. Re-run analysis to generate Human-written, Mixed, and AI-generated data.
              </div>
            )}
          </div>

          {(onHumanize || onGoPremium) && (
            <div>
              <button
                onClick={humanizeEnabled ? onHumanize : onGoPremium}
                disabled={humanizeEnabled ? !canHumanize : false}
                className={cn(
                  'w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                  humanizeEnabled && canHumanize
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-sm'
                    : !humanizeEnabled
                    ? 'bg-amber-500 text-white hover:bg-amber-400 shadow-sm shadow-amber-500/20'
                    : D
                    ? 'cursor-not-allowed bg-slate-800 text-slate-500'
                    : 'cursor-not-allowed bg-slate-100 text-slate-400',
                )}
              >
                {humanizeEnabled
                  ? (isHumanizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />)
                  : <Lock className="h-4 w-4" />}
                {humanizeEnabled ? (isHumanizing ? 'Humanizing (Beta)...' : 'Humanize (Beta)') : 'Humanize Text (Beta)'}
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                    humanizeEnabled ? 'bg-white/20 text-white' : 'bg-amber-400/80 text-white',
                  )}
                >
                  Beta
                </span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                    humanizeEnabled ? 'bg-amber-400/90 text-black' : 'bg-amber-200 text-amber-800',
                  )}
                >
                  Premium
                </span>
                {!humanizeEnabled && <Crown className="h-4 w-4" />}
              </button>
              {humanizeEnabled && !canHumanize && (
                <p className="mt-1.5 text-center text-[10px] text-slate-500">
                  Re-run analysis first to generate AI-flagged passages.
                </p>
              )}
              {humanizeEnabled && (
                <p className="mt-1.5 text-center text-[10px] text-amber-500">
                  Humanizing text is in beta and may not work properly.
                </p>
              )}
              {!humanizeEnabled && (
                <p className="mt-1.5 text-center text-[10px] text-amber-500">
                  Humanize (Beta) is a Premium feature.
                </p>
              )}
            </div>
          )}

        </div>
      )}

      {/* ───────────────────── TAB 3: LANGUAGE QUALITY ───────────────────── */}
      {activeTab === 'language' && (
        <div className={cn(card, 'p-5 space-y-6 animate-[panelFade_.24s_ease-out]')}>

          {/* Grammar panel */}
          <div>
            <SectionLabel icon={AlertTriangle} label="Grammar" isDark={D} />
            <div className={cn('rounded-xl border p-4',
              grammarScore >= 80 ? (D ? 'border-green-900/40 bg-green-950/20'  : 'border-green-200 bg-green-50')
              : grammarScore >= 55 ? (D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')
              :                       (D ? 'border-red-900/40 bg-red-950/20'    : 'border-red-200 bg-red-50'))}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Grammar Score</p>
                  <p className={cn('text-3xl font-black leading-none mt-1',
                    grammarScore >= 80 ? (D ? 'text-green-300' : 'text-green-700')
                    : grammarScore >= 55 ? (D ? 'text-amber-300' : 'text-amber-700')
                    : (D ? 'text-red-300' : 'text-red-700'))}>
                    {Math.round(grammarScore)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{grammarScoreLabel(grammarScore)}</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'Errors', count: errorCount, cls: D ? 'border-red-900/50 bg-red-950/20 text-red-300' : 'border-red-200 bg-red-50 text-red-700' },
                    { label: 'Warnings', count: warningCount, cls: D ? 'border-amber-900/50 bg-amber-950/20 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700' },
                    { label: 'Tips', count: suggestionCount, cls: D ? 'border-blue-900/50 bg-blue-950/20 text-blue-300' : 'border-blue-200 bg-blue-50 text-blue-700' },
                  ].map((item) => (
                    <div key={item.label} className={cn('min-w-[68px] rounded-lg border px-2 py-1 text-center', item.cls)}>
                      <p className="text-[10px] font-semibold">{item.label}</p>
                      <p className="text-sm font-bold leading-none mt-1">{item.count}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {[
                  { Icon: XCircle,     col: 'red',   label: 'Errors',      count: errorCount      },
                  { Icon: AlertCircle, col: 'amber', label: 'Warnings',    count: warningCount    },
                  { Icon: Info,        col: 'blue',  label: 'Suggestions', count: suggestionCount },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <s.Icon className={cn('h-3.5 w-3.5 flex-shrink-0', `text-${s.col}-500`)} />
                    <span className={cn('w-20 text-[11px] font-medium', D ? 'text-slate-300' : 'text-slate-700')}>{s.label}</span>
                    <div className={cn('flex-1 h-1.5 rounded-full overflow-hidden', D ? 'bg-slate-800' : 'bg-slate-200')}>
                      <div
                        className={cn('h-full rounded-full transition-all duration-700', `bg-${s.col}-500`)}
                        style={{ width: `${Math.min(100, (s.count / Math.max(issueCount, 1)) * 100)}%` }}
                      />
                    </div>
                    <span className={cn('text-xs font-bold w-5 text-right', D ? 'text-slate-300' : 'text-slate-700')}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {!grammarFixEnabled && onGoPremium && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={onGoPremium}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-all shadow-sm shadow-amber-500/20"
                >
                  <Lock className="h-4 w-4" /> Grammar Fix
                  <span className="rounded bg-amber-400/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    Premium
                  </span>
                  <Crown className="h-4 w-4" />
                </button>
                <p className="mt-1.5 text-center text-[10px] text-amber-500">
                  Grammar Fix is a Premium feature.
                </p>
              </div>
            )}

            {grammarFixEnabled && onUndoGrammarFix && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={onUndoGrammarFix}
                  disabled={!canUndoGrammarFix}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                    canUndoGrammarFix
                      ? (D ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                      : (D ? 'cursor-not-allowed bg-slate-900 text-slate-500' : 'cursor-not-allowed bg-slate-100 text-slate-400'),
                  )}
                  title="Undo last grammar fix"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Undo Last Fix
                </button>
              </div>
            )}

            {issueCount === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className={cn('font-bold', D ? 'text-white' : 'text-slate-900')}>No grammar issues</p>
                <p className="text-xs text-slate-500">Your writing is grammatically clean.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-[11px] text-slate-500">
                  Line-by-line grammar issues. Click <span className="font-semibold">Fix</span> to apply the suggested correction.
                </p>
                <div className={cn('space-y-2', expanded ? '' : 'max-h-[28rem] overflow-y-auto pr-1')}>
                  {sortedIssues.map((issue, i) => (
                    <GrammarIssueCard
                      key={i}
                      issue={issue}
                      isDark={D}
                      onApplyGrammarFix={onApplyGrammarFix}
                      onGoPremium={onGoPremium}
                      canUseGrammarFix={grammarFixEnabled}
                      lineNumber={getGrammarIssueLine?.(issue) ?? null}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────── TAB 4: TONE & BIAS ───────────────────────── */}
      {activeTab === 'tone' && (
        <div className={cn(card, 'p-5 space-y-6 animate-[panelFade_.24s_ease-out]')}>
          {!toneBiasEnabled ? (
            <div className={cn('rounded-xl border p-6 text-center', D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')}>
              <p className={cn('text-sm font-bold mb-1', D ? 'text-amber-300' : 'text-amber-700')}>Tone &amp; Bias is Premium</p>
              <p className="text-xs text-slate-500">Upgrade to unlock tone breakdown and bias detection insights.</p>
              {onGoPremium && (
                <button
                  type="button"
                  onClick={onGoPremium}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-400"
                >
                  <Crown className="h-3.5 w-3.5" /> Go Premium
                </button>
              )}
            </div>
          ) : analysis.tone ? (
            <>
              {/* Tone summary */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className={cn('rounded-xl border p-4 sm:col-span-2', D ? 'border-indigo-800/40 bg-indigo-950/30' : 'border-indigo-200 bg-indigo-50')}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Dominant Tone</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-bold capitalize', D ? 'bg-indigo-900/50 text-indigo-200' : 'bg-indigo-100 text-indigo-700')}>
                      {analysis.tone.dominantTone}
                    </span>
                    <span className={cn('text-xs font-semibold', D ? 'text-indigo-200' : 'text-indigo-700')}>
                      {toneConf}% confidence
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Tone profile estimates how your writing sounds to readers across multiple styles.</p>
                </div>
                <div className={cn('rounded-xl border p-4 flex items-center justify-center', D ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-white')}>
                  <ScoreRing value={toneConf} label="Confidence" size="lg" isDark={D} />
                </div>
              </div>

              {/* Breakdown bars */}
              <div>
                <SectionLabel icon={Activity} label="Tone Breakdown" isDark={D} />
                {(() => {
                  const colors: Record<string,string> = {
                    formal:         'bg-indigo-500',
                    conversational: 'bg-emerald-500',
                    persuasive:     'bg-orange-500',
                    technical:      'bg-cyan-500',
                    narrative:      'bg-pink-500',
                    instructional:  'bg-violet-500',
                  };
                  const descs: Record<string,string> = {
                    formal:         'Academic, professional, structured',
                    conversational: 'Friendly, casual, approachable',
                    persuasive:     'Convincing, argument-driven',
                    technical:      'Precise, domain-specific',
                    narrative:      'Storytelling, descriptive',
                    instructional:  'Step-based, directive',
                  };
                  return (
                    <div className="space-y-2.5">
                      {Object.entries(analysis.tone!.breakdown).sort(([,a],[,b]) => b-a).map(([name, score]) => {
                        const pct = Math.round(score * 100);
                        return (
                          <div key={name} className={cn('rounded-xl border p-3', D ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/70')}>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className={cn('text-xs capitalize font-semibold', D ? 'text-slate-200' : 'text-slate-800')}>{name}</span>
                              <span className="text-xs font-bold text-slate-500">{pct}%</span>
                            </div>
                            <div className={cn('h-2 w-full rounded-full overflow-hidden', D ? 'bg-slate-800' : 'bg-slate-200')}>
                              <div className={cn('h-full rounded-full transition-all duration-700', colors[name] ?? 'bg-slate-500')}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <p className="mt-1.5 text-[10px] text-slate-500">{descs[name] ?? ''}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <Hr isDark={D} />

              {/* Bias flags */}
              <div>
                <SectionLabel icon={AlertOctagon} label={`Bias Flags${biasFlags.length ? ` (${biasFlags.length})` : ''}`} isDark={D} />
                {biasFlags.length === 0 ? (
                  <div className={cn('rounded-xl border p-4 flex items-center gap-3', D ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-100')}>
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <p className={cn('text-xs', D ? 'text-slate-400' : 'text-slate-600')}>No significant bias patterns detected.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                      Examples of emotional, opinion-heavy, or speculative language detected in this text.
                    </p>
                    {biasFlags.map((flag, i) => (
                      <div key={i} className={cn('rounded-xl border p-3', D ? 'bg-red-950/20 border-red-900/40' : 'bg-red-50/60 border-red-200')}>
                        <div className="flex items-start gap-2.5">
                          <AlertOctagon className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className={cn('text-xs leading-relaxed', D ? 'text-slate-300' : 'text-slate-700')}>{flag}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Activity className="h-10 w-10 text-slate-400" />
              <p className={cn('font-semibold', D ? 'text-white' : 'text-slate-900')}>Tone data not available</p>
              <p className="text-xs text-slate-500">Re-run analysis to detect writing tone and bias.</p>
            </div>
          )}
        </div>
      )}

      </div>

      <style>{`@keyframes panelFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes auroraShift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(10px,-8px,0) scale(1.08)}}`}</style>
    </div>
  );
}

export default AnalysisPanel;
