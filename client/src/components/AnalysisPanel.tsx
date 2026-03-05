'use client';

import { AnalysisResult, GrammarIssue, AnalysisProgress } from '@/types';
import { cn, grammarScoreLabel } from '@/lib/utils';
import {
  Loader2, AlertTriangle, CheckCircle2, Lightbulb, BookOpen,
  ChevronDown, ChevronRight, XCircle, AlertCircle, Info,
  RefreshCw, Brain, Gauge, Sparkles, X, Bot, Shield,
  ScanSearch, Save, FileCheck2, Hash, Clock, BarChart3, Mic2,
  AlertOctagon, Eye, Activity,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  analysis:          AnalysisResult | null;
  isAnalyzing:       boolean;
  analysisProgress?: AnalysisProgress | null;
  onAnalyze:         () => void;
  onCancelAnalyze?:  () => void;
  onSave?:           () => void;
  documentStatus:    string;
  expanded?:         boolean;
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
    <div className={cn('rounded-2xl border p-6 flex flex-col items-center gap-6', isDark ? 'bg-[#0f0f1a] border-indigo-900/40' : 'bg-white border-indigo-100')}>
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

// ─── Grammar Issue Card ───────────────────────────────────────────────────────

const sevCfg = {
  error:      { label: 'Error',      Icon: XCircle,     cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800' },
  warning:    { label: 'Warning',    Icon: AlertCircle, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800' },
  suggestion: { label: 'Suggestion', Icon: Info,        cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800' },
} as const;

function GrammarIssueCard({ issue, isDark }: { issue: GrammarIssue; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const sev = (issue.severity ?? 'warning') as keyof typeof sevCfg;
  const { label, Icon: SevIcon, cls } = sevCfg[sev] ?? sevCfg.warning;
  return (
    <div className={cn('rounded-xl border p-3',
      sev === 'error'      ? (isDark ? 'border-red-900/40 bg-red-950/20'    : 'border-red-100 bg-red-50/40')
      : sev === 'suggestion' ? (isDark ? 'border-blue-900/40 bg-blue-950/20'  : 'border-blue-100 bg-blue-50/40')
      :                         (isDark ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-100 bg-amber-50/40'))}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-2 text-left">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
              <SevIcon className="h-3 w-3" /> {label}
            </span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500')}>{issue.rule.category}</span>
          </div>
          <p className={cn('text-sm font-medium leading-snug', isDark ? 'text-slate-100' : 'text-slate-800')}>{issue.shortMessage || issue.message}</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-400" />}
      </button>
      {open && (
        <div className={cn('mt-2.5 space-y-2 border-t pt-2.5', isDark ? 'border-slate-700' : 'border-slate-200')}>
          {issue.shortMessage && issue.shortMessage !== issue.message && (
            <p className={cn('text-xs', isDark ? 'text-slate-300' : 'text-slate-600')}>{issue.message}</p>
          )}
          <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
            <span className={cn('font-medium', isDark ? 'text-slate-300' : 'text-slate-600')}>Rule: </span>
            {issue.rule.description || issue.rule.id}
          </p>
          {issue.context && (
            <div className={cn('rounded-lg px-2.5 py-1.5 text-xs font-mono leading-relaxed', isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600')}>
              ...{issue.context}...
            </div>
          )}
          {issue.replacements.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-slate-400 font-medium">Suggested fixes:</p>
              <div className="flex flex-wrap gap-1">
                {issue.replacements.slice(0, 5).map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-0.5 rounded bg-green-50 dark:bg-green-900/30 px-2 py-0.5 text-xs text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
  analysis, isAnalyzing, analysisProgress, onAnalyze, onCancelAnalyze, onSave, documentStatus, expanded = false,
}: Props) {
  const { theme } = useTheme();
  const D = theme === 'dark';

  const card = cn('rounded-2xl border', D ? 'bg-[#0f0f1a] border-slate-800'     : 'bg-white border-slate-100');
  const sub  = cn('rounded-xl border p-4', D ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-100');

  const [activeTab,    setActiveTab]    = useState<TabId>('overview');
  const [grammarFilter, setGrammarFilter] = useState<'all'|'error'|'warning'|'suggestion'>('all');

  // ── Derived values ──────────────────────────────────────────────────────────

  const aiScore       = analysis?.aiScore           ?? -1;
  const isQuotaError  = analysis?.aiReasoning?.includes('quota') || analysis?.aiReasoning?.includes('Quota');
  const grammarScore  = analysis?.grammarScore       ?? 0;
  const readability   = analysis?.readabilityScore   ?? 0;
  const toneConf      = analysis?.tone?.confidence != null ? Math.round(analysis.tone.confidence * 100) : 0;
  const dominantTone  = analysis?.tone?.dominantTone ?? '—';
  const issueCount    = analysis?.grammarIssues?.length ?? 0;
  const claimFlags    = analysis?.claimFlags    ?? [];
  const longSentences = analysis?.longSentences ?? [];
  const biasFlags     = analysis?.tone?.biasFlags ?? [];
  const lastAnalyzed  = analysis?.analyzedAt ? new Date(analysis.analyzedAt).toLocaleString() : null;

  const aiVerdict =
    aiScore >= 70 ? 'Likely AI-Generated'
    : aiScore >= 40 ? 'Possibly AI-Assisted'
    : aiScore >= 0  ? 'Appears Human-Written'
    : '—';

  const sortedIssues = useMemo(() => {
    if (!analysis?.grammarIssues) return [];
    const order: Record<string,number> = { error: 0, warning: 1, suggestion: 2 };
    return [...analysis.grammarIssues].sort((a, b) =>
      (order[a.severity ?? 'warning'] ?? 1) - (order[b.severity ?? 'warning'] ?? 1)
        || (a.message || '').localeCompare(b.message || ''));
  }, [analysis]);

  const filteredIssues  = useMemo(() =>
    grammarFilter === 'all' ? sortedIssues : sortedIssues.filter((i) => (i.severity ?? 'warning') === grammarFilter),
    [sortedIssues, grammarFilter]);

  const errorCount      = useMemo(() => analysis?.grammarIssues?.filter((i) => i.severity === 'error').length      ?? 0, [analysis]);
  const warningCount    = useMemo(() => analysis?.grammarIssues?.filter((i) => i.severity === 'warning').length    ?? 0, [analysis]);
  const suggestionCount = useMemo(() => analysis?.grammarIssues?.filter((i) => i.severity === 'suggestion').length ?? 0, [analysis]);

  // ── Loading states ──────────────────────────────────────────────────────────

  if (isAnalyzing && analysisProgress) return <ProgressScreen progress={analysisProgress} onCancel={onCancelAnalyze} isDark={D} />;

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

  const tabs: Array<{ id: TabId; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'overview',  label: 'Overview',          icon: Gauge },
    { id: 'integrity', label: 'Content Integrity',  icon: Shield,        badge: claimFlags.length  },
    { id: 'language',  label: 'Language',            icon: AlertTriangle, badge: issueCount         },
    { id: 'tone',      label: 'Tone & Bias',         icon: Activity,      badge: biasFlags.length   },
  ];

  return (
    <div className="space-y-4">

      {/* Tab bar */}
      <div className={cn(card, 'p-2')}>
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn('flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : D ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800')}>
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  activeTab === tab.id ? 'bg-white/20 text-white' : (D ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'))}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ───────────────────────── TAB 1: OVERVIEW ──────────────────────────── */}
      {activeTab === 'overview' && (
        <div className={cn(card, 'p-5 space-y-6')}>

          {/* 4 Score Rings */}
          <div>
            <SectionLabel icon={BarChart3} label="Editorial Scores" isDark={D} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <ScoreRing value={aiScore} label="AI Score"
                sublabel={aiScore >= 0 ? aiVerdict : undefined} isDark={D} inverted />
              <ScoreRing value={grammarScore} label="Grammar"    sublabel={grammarScoreLabel(grammarScore)} isDark={D} />
              <ScoreRing value={readability}  label="Readability" isDark={D} />
              <ScoreRing value={toneConf}     label="Tone Conf."  isDark={D} />
            </div>
          </div>

          <Hr isDark={D} />

          {/* Quick Status Row */}
          <div className="grid grid-cols-3 gap-2">
            <div className={cn('rounded-xl border p-3 text-center',
              isQuotaError ? (D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')
              : aiScore >= 70 ? (D ? 'border-red-900/40 bg-red-950/20'    : 'border-red-200 bg-red-50')
              : aiScore >= 40 ? (D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')
              :                  (D ? 'border-green-900/40 bg-green-950/20' : 'border-green-200 bg-green-50'))}>
              <Bot className={cn('h-4 w-4 mx-auto mb-1', isQuotaError ? 'text-amber-400' : aiScore >= 70 ? 'text-red-400' : aiScore >= 40 ? 'text-amber-400' : 'text-green-400')} />
              <p className="text-[10px] font-bold text-slate-500 mb-0.5">AI Risk</p>
              <p className={cn('text-[11px] font-semibold',
                isQuotaError ? (D ? 'text-amber-300' : 'text-amber-700')
                : aiScore >= 70 ? (D ? 'text-red-300' : 'text-red-700') : aiScore >= 40 ? (D ? 'text-amber-300' : 'text-amber-700') : (D ? 'text-green-300' : 'text-green-700'))}>
                {isQuotaError ? 'Unavailable' : aiScore >= 70 ? 'High' : aiScore >= 40 ? 'Medium' : 'Low'}
              </p>
            </div>
            <div className={cn('rounded-xl border p-3 text-center',
              grammarScore >= 80 ? (D ? 'border-green-900/40 bg-green-950/20'  : 'border-green-200 bg-green-50')
              : grammarScore >= 55 ? (D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')
              :                       (D ? 'border-red-900/40 bg-red-950/20'    : 'border-red-200 bg-red-50'))}>
              <FileCheck2 className={cn('h-4 w-4 mx-auto mb-1', grammarScore >= 80 ? 'text-green-400' : grammarScore >= 55 ? 'text-amber-400' : 'text-red-400')} />
              <p className="text-[10px] font-bold text-slate-500 mb-0.5">Grammar</p>
              <p className={cn('text-[11px] font-semibold',
                grammarScore >= 80 ? (D ? 'text-green-300' : 'text-green-700') : grammarScore >= 55 ? (D ? 'text-amber-300' : 'text-amber-700') : (D ? 'text-red-300' : 'text-red-700'))}>
                {issueCount === 0 ? 'Clean' : `${issueCount} issue${issueCount !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className={cn('rounded-xl border p-3 text-center', D ? 'border-indigo-900/40 bg-indigo-950/20' : 'border-indigo-200 bg-indigo-50')}>
              <Mic2 className="h-4 w-4 mx-auto mb-1 text-indigo-400" />
              <p className="text-[10px] font-bold text-slate-500 mb-0.5">Dominant Tone</p>
              <p className={cn('text-[11px] font-semibold capitalize', D ? 'text-indigo-300' : 'text-indigo-700')}>{dominantTone}</p>
            </div>
          </div>

          <Hr isDark={D} />

          {/* Stats */}
          <div>
            <SectionLabel icon={BookOpen} label="Document Stats" isDark={D} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {[
                { label: 'Words',        value: (analysis.wordCount ?? 0).toLocaleString(),           icon: Hash,         accent: 'text-indigo-400'  },
                { label: 'Sentences',    value: (analysis.sentenceCount ?? 0).toLocaleString(),        icon: BookOpen,     accent: 'text-blue-400'    },
                { label: 'Reading Time', value: analysis.readingTimeMinutes != null ? `~${analysis.readingTimeMinutes.toFixed(1)} min` : '—', icon: Clock, accent: 'text-cyan-400' },
                { label: 'Grade Level',  value: analysis.fleschGradeLevel?.split('(')[0]?.trim() ?? '—', icon: BarChart3, accent: 'text-violet-400'  },
                { label: 'Avg Sentence', value: analysis.avgSentenceLength != null ? `${analysis.avgSentenceLength.toFixed(1)} wds` : '—', icon: Gauge, accent: 'text-amber-400' },
                { label: 'Claim Flags',  value: String(claimFlags.length),                             icon: AlertOctagon, accent: 'text-orange-400'  },
              ].map((s) => (
                <div key={s.label} className={cn(sub, 'flex items-center gap-2.5')}>
                  <s.icon className={cn('h-4 w-4 flex-shrink-0', s.accent)} />
                  <div className="min-w-0">
                    <p className={cn('text-sm font-bold truncate', D ? 'text-white' : 'text-slate-900')}>{s.value}</p>
                    <p className="text-[10px] text-slate-500">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {lastAnalyzed && <p className="text-[11px] text-slate-500 text-center">Analysed {lastAnalyzed}</p>}

          <div className="flex gap-2">
            <button onClick={onAnalyze} className={cn('flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all border',
              D ? 'border-indigo-800/50 text-indigo-400 hover:bg-indigo-950/50' : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50')}>
              <RefreshCw className="h-4 w-4" /> Re-run
            </button>
            {onSave && (
              <button onClick={onSave} className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 shadow-sm transition-all">
                <Save className="h-4 w-4" /> Save
              </button>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────── TAB 2: CONTENT INTEGRITY ───────────────────── */}
      {activeTab === 'integrity' && (
        <div className={cn(card, 'p-5 space-y-6')}>

          {/* AI Likelihood hero */}
          <div>
            <SectionLabel icon={Bot} label="AI Likelihood" isDark={D} />
            <div className={cn('rounded-xl border p-5 flex flex-col items-center gap-4',
              aiScore >= 70 ? (D ? 'bg-red-950/30 border-red-900/40'    : 'bg-red-50 border-red-200')
              : aiScore >= 40 ? (D ? 'bg-amber-950/30 border-amber-900/40' : 'bg-amber-50 border-amber-200')
              :                  (D ? 'bg-green-950/30 border-green-900/40' : 'bg-green-50 border-green-200'))}>
              <ScoreRing value={aiScore} label="AI Score" size="lg" isDark={D} inverted />
              <span className={cn('rounded-full px-4 py-1.5 text-xs font-bold flex items-center gap-1.5',
                aiScore >= 70 ? (D ? 'bg-red-900/50 text-red-200'    : 'bg-red-100 text-red-700')
                : aiScore >= 40 ? (D ? 'bg-amber-900/50 text-amber-200' : 'bg-amber-100 text-amber-700')
                :                  (D ? 'bg-green-900/50 text-green-200' : 'bg-green-100 text-green-700'))}>
                <Bot className="h-3.5 w-3.5" />{aiVerdict}
              </span>
              <div className="w-full grid grid-cols-3 gap-1.5">
                {[
                  { range: '0–39',   label: 'Human',       color: D ? 'text-green-400' : 'text-green-600' },
                  { range: '40–69',  label: 'Possible AI',  color: D ? 'text-amber-400' : 'text-amber-600' },
                  { range: '70–100', label: 'Likely AI',    color: D ? 'text-red-400'   : 'text-red-600'   },
                ].map(({ range, label, color }) => (
                  <div key={range} className={cn('text-center rounded-lg p-2', D ? 'bg-slate-800/60' : 'bg-white/70')}>
                    <p className={cn('text-[10px] font-bold', color)}>{label}</p>
                    <p className="text-[9px] text-slate-500">{range}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-500 text-center leading-relaxed">
              Probability assessment only — AI detection tools carry inherent uncertainty.
            </p>
          </div>

          {analysis.aiReasoning && (
            <div>
              <SectionLabel icon={ScanSearch} label="Detection Analysis" isDark={D} />
              <div className={cn('rounded-xl border p-4', D ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-100')}>
                <p className={cn('text-sm leading-relaxed', D ? 'text-slate-300' : 'text-slate-700')}>{analysis.aiReasoning}</p>
              </div>
            </div>
          )}

          <Hr isDark={D} />

          {/* Humanization tips */}
          {(analysis.humanizationTips ?? []).length > 0 && (
            <div>
              <SectionLabel icon={Lightbulb} label="Humanization Suggestions" isDark={D} />
              <div className="space-y-2">
                {(analysis.humanizationTips ?? []).map((tip, i) => (
                  <div key={i} className={cn('flex items-start gap-3 rounded-xl border p-3', D ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-100')}>
                    <span className={cn('flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5',
                      D ? 'bg-indigo-900/60 text-indigo-300' : 'bg-indigo-100 text-indigo-600')}>{i + 1}</span>
                    <p className={cn('text-xs leading-relaxed', D ? 'text-slate-300' : 'text-slate-700')}>{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Hr isDark={D} />

          {/* Claim flags */}
          <div>
            <SectionLabel icon={AlertOctagon} label={`Claim Flags${claimFlags.length ? ` (${claimFlags.length})` : ''}`} isDark={D} />
            {claimFlags.length === 0 ? (
              <div className={cn('rounded-xl border p-4 flex items-center gap-3', D ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-100')}>
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <p className={cn('text-xs', D ? 'text-slate-400' : 'text-slate-600')}>No flagged claims detected.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                  Sentences containing statistics, numbers or strong factual claims that may require source verification.
                </p>
                {claimFlags.map((claim, i) => (
                  <div key={i} className={cn('rounded-xl border p-3', D ? 'bg-amber-950/20 border-amber-900/40' : 'bg-amber-50/60 border-amber-200')}>
                    <div className="flex items-start gap-2.5">
                      <AlertOctagon className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs leading-relaxed', D ? 'text-slate-300' : 'text-slate-700')}>{claim}</p>
                        <span className={cn('mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold',
                          D ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-700')}>
                          May require source verification
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────── TAB 3: LANGUAGE QUALITY ───────────────────── */}
      {activeTab === 'language' && (
        <div className={cn(card, 'p-5 space-y-6')}>

          {/* Grammar panel */}
          <div>
            <SectionLabel icon={AlertTriangle} label="Grammar" isDark={D} />
            <div className={cn('rounded-xl border p-4 flex items-center gap-5',
              grammarScore >= 80 ? (D ? 'border-green-900/40 bg-green-950/20'  : 'border-green-200 bg-green-50')
              : grammarScore >= 55 ? (D ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50')
              :                       (D ? 'border-red-900/40 bg-red-950/20'    : 'border-red-200 bg-red-50'))}>
              <ScoreRing value={grammarScore} label="Grammar" sublabel={grammarScoreLabel(grammarScore)} isDark={D} />
              <div className="flex-1 space-y-2">
                {[
                  { Icon: XCircle,     col: 'red',   label: 'Errors',      count: errorCount      },
                  { Icon: AlertCircle, col: 'amber',  label: 'Warnings',    count: warningCount    },
                  { Icon: Info,        col: 'blue',   label: 'Suggestions', count: suggestionCount },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <s.Icon className={cn('h-3.5 w-3.5 flex-shrink-0', `text-${s.col}-500`)} />
                    <div className={cn('flex-1 h-1.5 rounded-full overflow-hidden', D ? 'bg-slate-800' : 'bg-slate-200')}>
                      <div className={cn('h-full rounded-full transition-all duration-700', `bg-${s.col}-500`)}
                        style={{ width: `${Math.min(100, (s.count / Math.max(issueCount, 1)) * 100)}%` }} />
                    </div>
                    <span className={cn('text-xs font-bold w-5 text-right', D ? 'text-slate-300' : 'text-slate-700')}>{s.count}</span>
                    <span className="text-[10px] text-slate-500 w-16">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {issueCount === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className={cn('font-bold', D ? 'text-white' : 'text-slate-900')}>No grammar issues</p>
                <p className="text-xs text-slate-500">Your writing is grammatically clean.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex gap-1.5 flex-wrap">
                  {(['all', 'error', 'warning', 'suggestion'] as const).map((f) => {
                    const cnt = f === 'all' ? issueCount : analysis.grammarIssues.filter((i) => (i.severity ?? 'warning') === f).length;
                    if (f !== 'all' && cnt === 0) return null;
                    return (
                      <button key={f} onClick={() => setGrammarFilter(f)}
                        className={cn('rounded-full px-3 py-1 text-xs font-semibold capitalize transition-all',
                          grammarFilter === f
                            ? f === 'error' ? 'bg-red-600 text-white' : f === 'warning' ? 'bg-amber-500 text-white' : f === 'suggestion' ? 'bg-blue-500 text-white' : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white'
                            : (D ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'))}>
                        {f} ({cnt})
                      </button>
                    );
                  })}
                </div>
                <div className={cn('space-y-2', expanded ? '' : 'max-h-[28rem] overflow-y-auto pr-1')}>
                  {filteredIssues.map((issue, i) => <GrammarIssueCard key={i} issue={issue} isDark={D} />)}
                  {filteredIssues.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No {grammarFilter} issues.</p>}
                </div>
              </div>
            )}
          </div>

          <Hr isDark={D} />

          {/* Readability panel */}
          <div>
            <SectionLabel icon={Eye} label="Readability" isDark={D} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { label: 'Flesch Score',  value: String(Math.round(readability)),                           accent: readability >= 60 ? 'text-green-500' : readability >= 40 ? 'text-amber-500' : 'text-red-500' },
                { label: 'Grade',         value: analysis.fleschGradeLevel?.split('(')[0]?.trim() ?? '—',   accent: D ? 'text-slate-200' : 'text-slate-900' },
                { label: 'Reading Time',  value: analysis.readingTimeMinutes != null ? `~${analysis.readingTimeMinutes.toFixed(1)} min` : '—', accent: 'text-cyan-500' },
                { label: 'Avg Sentence',  value: analysis.avgSentenceLength != null ? `${analysis.avgSentenceLength.toFixed(1)} wds` : '—',   accent: 'text-violet-500' },
              ].map((s) => (
                <div key={s.label} className={cn(sub, 'text-center')}>
                  <p className={cn('text-xl font-black', s.accent)}>{s.value}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {analysis.fleschGradeLevel && (
              <p className={cn('mt-2 text-xs text-center', D ? 'text-slate-400' : 'text-slate-500')}>{analysis.fleschGradeLevel}</p>
            )}
          </div>

          <Hr isDark={D} />

          {/* Long sentences */}
          <div>
            <SectionLabel icon={AlertTriangle} label={`Long Sentences${longSentences.length ? ` (${longSentences.length})` : ''}`} isDark={D} />
            {longSentences.length === 0 ? (
              <div className={cn('rounded-xl border p-4 flex items-center gap-3', D ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-100')}>
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <p className={cn('text-xs', D ? 'text-slate-400' : 'text-slate-600')}>No sentences over 30 words.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 mb-2">Sentences over 30 words may reduce clarity. Consider splitting them.</p>
                {longSentences.map((sent, i) => {
                  const wc = sent.trim().split(/\s+/).length;
                  return (
                    <div key={i} className={cn('rounded-xl border p-3', D ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200')}>
                      <p className={cn('text-xs leading-relaxed mb-1.5', D ? 'text-slate-300' : 'text-slate-700')}>{sent.trim()}</p>
                      <span className={cn('inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-2 py-0.5',
                        wc > 45 ? (D ? 'bg-red-900/40 text-red-400' : 'bg-red-100 text-red-700')
                                : (D ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700'))}>
                        <AlertTriangle className="h-2.5 w-2.5" /> {wc} words
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────── TAB 4: TONE & BIAS ───────────────────────── */}
      {activeTab === 'tone' && (
        <div className={cn(card, 'p-5 space-y-6')}>
          {analysis.tone ? (
            <>
              {/* Tone hero */}
              <div className={cn('rounded-xl border p-5 flex items-center gap-5', D ? 'bg-indigo-950/30 border-indigo-800/40' : 'bg-indigo-50 border-indigo-200')}>
                <ScoreRing value={toneConf} label="Confidence" size="lg" isDark={D} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Dominant Tone</p>
                  <p className={cn('text-2xl font-black capitalize', D ? 'text-white' : 'text-slate-900')}>{analysis.tone.dominantTone}</p>
                  <p className="text-xs text-slate-500 mt-1">{toneConf}% confidence across all dimensions</p>
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
                    <div className="space-y-3">
                      {Object.entries(analysis.tone!.breakdown).sort(([,a],[,b]) => b-a).map(([name, score]) => {
                        const pct = Math.round(score * 100);
                        return (
                          <div key={name} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className={cn('text-xs capitalize font-semibold', D ? 'text-slate-300' : 'text-slate-700')}>{name}</span>
                              <span className="text-xs font-bold text-slate-500">{pct}%</span>
                            </div>
                            <div className={cn('h-2 w-full rounded-full overflow-hidden', D ? 'bg-slate-800' : 'bg-slate-200')}>
                              <div className={cn('h-full rounded-full transition-all duration-700', colors[name] ?? 'bg-slate-500')}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[10px] text-slate-500">{descs[name] ?? ''}</p>
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
  );
}

export default AnalysisPanel;
