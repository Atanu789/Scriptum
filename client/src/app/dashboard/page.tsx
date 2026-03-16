'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { documentApi } from '@/lib/api';
import { useUsage } from '@/hooks/useUsage';
import { useSubscription } from '@/hooks/useSubscription';
import { DocumentSummary, UsageStats } from '@/types';
import {
  formatRelativeTime, formatWordCount, sourceTypeLabel,
  cn, grammarScoreLabel,
} from '@/lib/utils';
import {
  FileText, Upload, Plus, Trash2,
  FileType, File, Loader2, BookOpen,
  Pencil, CheckCircle2, Clock,
  AlertTriangle, TrendingUp, Sparkles,
  Search, SlidersHorizontal, ArrowUpRight,
  Zap, Globe, Crown,
  Image as ImageIcon, Video, Music,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Footer }        from '@/components/ui/footer';
import { CardSpotlight }  from '@/components/ui/card-spotlight';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MEDIA_TYPES = new Set(['image', 'audio', 'video']);

const sourceIcon = (type: string) => {
  switch (type) {
    case 'docx':    return FileType;
    case 'pdf':     return File;
    case 'website': return Globe;
    case 'image':   return ImageIcon;
    case 'video':   return Video;
    case 'audio':   return Music;
    default:        return FileText;
  }
};

function scoreColor(variant: 'grammar' | 'readability' | 'ai', value: number) {
  if (variant === 'ai') {
    if (value >= 70) return 'text-red-500 dark:text-red-400';
    if (value >= 40) return 'text-amber-500 dark:text-amber-400';
    return 'text-emerald-600 dark:text-emerald-400';
  }
  if (value >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (value >= 55) return 'text-amber-500 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
      <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-white/[0.04] animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="h-3 w-48 rounded bg-slate-200 dark:bg-white/[0.06] animate-pulse" />
        <div className="h-2.5 w-28 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
      </div>
      <div className="hidden sm:flex items-center gap-4">
        {[48, 40, 44].map((w) => (
          <div key={w} className="flex flex-col items-center gap-1">
            <div className="h-4 w-8 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
            <div className="h-2 w-6 rounded bg-slate-100 dark:bg-white/[0.03] animate-pulse" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 opacity-0">
        <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/[0.04]" />
        <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/[0.04]" />
        <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/[0.04]" />
      </div>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-white/[0.07] bg-white dark:bg-[#0d0d1a]/90 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5),0_4px_16px_rgba(0,0,0,0.4)] p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <div className="h-2 w-14 rounded bg-slate-200 dark:bg-white/[0.06] animate-pulse" />
        <div className="h-3.5 w-3.5 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
      </div>
      <div className="h-7 w-12 rounded bg-slate-200 dark:bg-white/[0.06] animate-pulse" />
      <div className="h-2.5 w-20 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
    </div>
  );
}

// ─── Document Row  (Aceternity spotlight hover) ────────────────────────────────

interface DocRowProps {
  doc: DocumentSummary;
  isLast: boolean;
  deletingId: string | null;
  onDelete: (e: React.MouseEvent, id: string, name: string) => Promise<void>;
}

function DocRow({ doc, isLast, deletingId, onDelete }: DocRowProps) {
  const router  = useRouter();
  const rowRef  = useRef<HTMLLIElement>(null);
  const [pos, setPos]     = useState({ x: 0, y: 0 });
  const [isHov, setIsHov] = useState(false);

  const Icon       = sourceIcon(doc.sourceType);
  const isAnalyzed = (doc.status === 'analyzed' || doc.status === 'ready') && doc.analysisRunAt;
  const hasGrammar = isAnalyzed && doc.grammarScore        != null;
  const hasReading = isAnalyzed && doc.readabilityScore    != null;
  const hasAI      = isAnalyzed && doc.aiScore             != null;
  const issueCount = doc.grammarIssues?.length ?? 0;

  return (
    <li
      ref={rowRef}
      className={cn(
        'group relative flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors overflow-hidden',
        !isLast && 'border-b border-slate-200 dark:border-white/[0.2]',
      )}
      onMouseMove={(e) => {
        const r = rowRef.current?.getBoundingClientRect();
        if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseEnter={() => setIsHov(true)}
      onMouseLeave={() => setIsHov(false)}
      onClick={() => router.push(`/editor/${doc._id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/editor/${doc._id}`)}
    >
      {/* Aceternity spotlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: isHov ? 1 : 0,
          background: `radial-gradient(340px circle at ${pos.x}px ${pos.y}px, rgba(99,102,241,0.08) 0%, transparent 65%)`,
        }}
      />
      {/* Left accent bar */}
      <div className="absolute inset-y-0 left-0 w-[2px] bg-indigo-500 scale-y-0 group-hover:scale-y-100 transition-transform origin-center rounded-r-full" />

      {/* Icon */}
      <div className="relative z-10 flex-shrink-0 h-9 w-9 rounded-xl bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 transition-colors">
        <Icon className="h-4 w-4 text-slate-400 dark:text-white/30 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
      </div>

      {/* Name + meta */}
      <div className="relative z-10 flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700 dark:text-white/80 group-hover:text-slate-900 dark:group-hover:text-white transition-colors truncate">
          {doc.originalFileName}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-[11px] text-slate-400 dark:text-white/30">
          <span className="capitalize">{sourceTypeLabel(doc.sourceType)}</span>
          <span>·</span>
          <span>{formatWordCount(doc.wordCount)}</span>
          <span>·</span>
          <span>{formatRelativeTime(doc.createdAt)}</span>
          {isAnalyzed && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-emerald-500 dark:text-emerald-500/60">
                <CheckCircle2 className="h-2.5 w-2.5" />
                analysed {formatRelativeTime(doc.analysisRunAt!)}
              </span>
            </>
          )}
          {!isAnalyzed && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-500/60">
                <Clock className="h-2.5 w-2.5" /> not analysed
              </span>
            </>
          )}
        </div>
      </div>

      {/* Score tokens */}
      {isAnalyzed ? (
        <div className="relative z-10 hidden sm:flex items-center gap-5 flex-shrink-0">
          {hasGrammar && <ScoreToken label="Grammar" value={doc.grammarScore!}     variant="grammar"     />}
          {hasReading && <ScoreToken label="Read."   value={doc.readabilityScore!} variant="readability" />}
          {hasAI      && <ScoreToken label="AI %"    value={doc.aiScore!}           variant="ai"          />}
          {issueCount > 0 ? (
            <div className="flex flex-col items-center min-w-[44px]">
              <span className="text-sm font-bold tabular-nums text-amber-500 dark:text-amber-400">{issueCount}</span>
              <span className="text-[10px] text-slate-400 dark:text-white/25 mt-0.5">issues</span>
            </div>
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-500/60 flex-shrink-0" />
          )}
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/analysis/${doc._id}`); }}
          className="relative z-10 hidden sm:block flex-shrink-0 text-xs font-medium text-indigo-500 dark:text-indigo-400/60 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
        >
          Run analysis →
        </button>
      )}

      {/* Actions — visible on hover */}
      <div
        className="relative z-10 flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/editor/${doc._id}`); }}
          title="Edit"
          className="rounded-lg p-2 text-slate-300 dark:text-white/25 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/analysis/${doc._id}`); }}
          title="Analysis"
          className="rounded-lg p-2 text-slate-300 dark:text-white/25 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => onDelete(e, doc._id, doc.originalFileName)}
          disabled={deletingId === doc._id}
          title="Delete"
          className="rounded-lg p-2 text-slate-300 dark:text-white/20 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-30"
        >
          {deletingId === doc._id
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </li>
  );
}

// ─── Score token ──────────────────────────────────────────────────────────────

function ScoreToken({ label, value, variant }: {
  label: string;
  value: number;
  variant: 'grammar' | 'readability' | 'ai';
}) {
  return (
    <div className="flex flex-col items-center min-w-[44px]">
      <span className={`text-sm font-bold tabular-nums ${scoreColor(variant, value)}`}>{value}</span>
      <span className="text-[10px] text-slate-400 dark:text-white/25 mt-0.5 whitespace-nowrap">{label}</span>
    </div>
  );
}

// ─── Media card ──────────────────────────────────────────────────────────────

interface MediaCardProps {
  doc: DocumentSummary;
  deletingId: string | null;
  onDelete: (e: React.MouseEvent, id: string, name: string) => Promise<void>;
}

function MediaCard({ doc, deletingId, onDelete }: MediaCardProps) {
  const router = useRouter();

  return (
    <div
      className="group relative rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.02] overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all hover:-translate-y-0.5 cursor-pointer shadow-sm"
      onClick={() => router.push(`/editor/${doc._id}`)}
    >
      {/* Preview area */}
      <div className="h-28 bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center overflow-hidden">
        {doc.sourceType === 'image' && doc.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.mediaUrl} alt={doc.originalFileName} className="w-full h-full object-cover" />
        ) : doc.sourceType === 'video' && doc.mediaUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={doc.mediaUrl} className="w-full h-full object-cover" muted preload="metadata" />
        ) : (
          <Music className="h-10 w-10 text-slate-300 dark:text-white/20" />
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-white/70 truncate">{doc.originalFileName}</p>
        <p className="mt-0.5 text-[10px] text-slate-400 dark:text-white/30 capitalize">
          {doc.sourceType} · {formatRelativeTime(doc.createdAt)}
        </p>
        {doc.sourceType === 'audio' && doc.mediaUrl && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio
            src={doc.mediaUrl}
            controls
            preload="none"
            className="w-full mt-1.5"
            style={{ height: 28 }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Delete button */}
      <button
        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 disabled:opacity-40"
        onClick={(e) => onDelete(e, doc._id, doc.originalFileName)}
        disabled={deletingId === doc._id}
        title="Delete"
      >
        {deletingId === doc._id
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <Trash2 className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ─── AI usage ring ──────────────────────────────────────────────────────────

function AIRing({ usage }: { usage: UsageStats }) {
  const R     = 16;
  const circ  = 2 * Math.PI * R;
  const frac  = Math.min(usage.geminiCallsThisHour / Math.max(usage.maxCallsPerHour, 1), 1);
  const offset = circ * (1 - frac);
  const color  = usage.remaining === 0 ? '#ef4444' : usage.remaining <= 3 ? '#f59e0b' : '#6366f1';

  return (
    <div className="group relative flex-shrink-0">
      {/* Ring */}
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={R} fill="none" strokeWidth="3"
          stroke="currentColor" className="text-slate-200 dark:text-white/[0.08]" />
        <circle cx="20" cy="20" r={R} fill="none" strokeWidth="3"
          stroke={color} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          className="transition-all duration-700" />
      </svg>

      {/* Centre count */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-bold tabular-nums leading-none" style={{ color }}>
          {usage.geminiCallsThisHour}<span className="opacity-40">/{usage.maxCallsPerHour}</span>
        </span>
      </div>

      {/* Hover tooltip */}
      <div className="pointer-events-none absolute right-0 top-full mt-2.5 z-50 w-52
        rounded-xl border border-slate-200 dark:border-white/[0.08]
        bg-white dark:bg-[#0d0d1a]
        shadow-[0_8px_24px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.6)]
        p-3 text-left
        opacity-0 group-hover:opacity-100
        translate-y-1 group-hover:translate-y-0
        transition-all duration-200">
        <p className="text-[11px] font-bold text-slate-700 dark:text-white/80 mb-2 flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-indigo-500" /> AI Analyses
        </p>
        <p className="text-[11px] text-slate-500 dark:text-white/40">
          <span className="font-semibold" style={{ color }}>{usage.geminiCallsThisHour}</span>
          &nbsp;of {usage.maxCallsPerHour} used this hour
        </p>
        {usage.remaining > 0 ? (
          <p className="mt-1 text-[10px] text-slate-400 dark:text-white/25">
            {usage.remaining} remaining&nbsp;·&nbsp;
            resets {new Date(usage.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        ) : (
          <p className="mt-1 text-[10px] text-red-500 dark:text-red-400 font-semibold">
            Limit reached&nbsp;·&nbsp;
            resets {new Date(usage.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {usage.totalAnalyses > 0 && (
          <p className="mt-2 pt-2 border-t border-slate-100 dark:border-white/[0.05] text-[10px] text-slate-400 dark:text-white/25">
            {usage.totalAnalyses} total analyses lifetime
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user }   = useAuth();
  const router     = useRouter();
  const { usage }  = useUsage();
  const { isPremium } = useSubscription();

  const [documents, setDocuments]   = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [total, setTotal]           = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortBy, setSortBy]         = useState<'recent' | 'name' | 'score'>('recent');
  const [query, setQuery]           = useState('');

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const { documents: docs, total: t } = await documentApi.list(1, 50);
      setDocuments(docs);
      setTotal(t);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Delete "${name}"?\nThis cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await documentApi.delete(id);
      setDocuments((prev) => prev.filter((d) => d._id !== id));
      setTotal((t) => t - 1);
      toast.success('Document deleted');
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const firstName  = user?.name?.split(' ')[0] ?? 'there';
  const textDocs   = documents.filter((d) => !MEDIA_TYPES.has(d.sourceType));
  const mediaDocs  = documents.filter((d) => MEDIA_TYPES.has(d.sourceType));

  const analyzedDocs = textDocs.filter((d) => d.status === 'analyzed' || d.status === 'ready');
  const docsWithGram = analyzedDocs.filter((d) => d.grammarScore != null);
  const avgGrammar   = docsWithGram.length
    ? Math.round(docsWithGram.reduce((s, d) => s + (d.grammarScore ?? 0), 0) / docsWithGram.length)
    : null;
  const totalWords  = textDocs.reduce((s, d) => s + (d.wordCount || 0), 0);
  const totalIssues = analyzedDocs.reduce((s, d) => s + (d.grammarIssues?.length ?? 0), 0);

  const stats = [
    {
      label:  'Documents',
      value:  String(textDocs.length),
      sub:    `${analyzedDocs.length} analysed`,
      icon:   FileText,
      accent: 'text-indigo-500 dark:text-indigo-400',
    },
    {
      label:  'Avg Grammar',
      value:  avgGrammar != null ? String(avgGrammar) : '—',
      sub:    avgGrammar != null ? grammarScoreLabel(avgGrammar) : 'Run analysis',
      icon:   TrendingUp,
      accent: avgGrammar == null
        ? 'text-slate-300 dark:text-white/20'
        : avgGrammar >= 80 ? 'text-emerald-500 dark:text-emerald-400'
        : avgGrammar >= 55 ? 'text-amber-500 dark:text-amber-400'
        : 'text-red-500 dark:text-red-400',
    },
    {
      label:  'Grammar Issues',
      value:  analyzedDocs.length ? String(totalIssues) : '—',
      sub:    analyzedDocs.length ? `across ${docsWithGram.length} doc${docsWithGram.length !== 1 ? 's' : ''}` : 'No analysis yet',
      icon:   AlertTriangle,
      accent: 'text-amber-500 dark:text-amber-400',
    },
    {
      label:  'Total Words',
      value:  formatWordCount(totalWords),
      sub:    `${documents.length} file${documents.length !== 1 ? 's' : ''}`,
      icon:   BookOpen,
      accent: 'text-violet-500 dark:text-violet-400',
    },
  ];

  const sortedFiltered = [...textDocs]
    .filter((d) => !query || d.originalFileName.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name')  return a.originalFileName.localeCompare(b.originalFileName);
      if (sortBy === 'score') return (b.grammarScore ?? -1) - (a.grammarScore ?? -1);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div className="min-h-screen">

      <main className="relative mx-auto max-w-5xl px-4 pt-12 pb-16 sm:px-6">

        {/* Top indigo glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-30 dark:opacity-20 -z-10"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(99,102,241,0.35) 0%, transparent 80%)' }}
        />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3 py-0.5 backdrop-blur-sm dark:border-indigo-500/20 dark:bg-indigo-500/10">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-600">
                <Sparkles className="h-2 w-2 text-white" />
              </span>
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">Workspace</span>
            </div>
            <h1 className="text-[28px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
              {isLoading ? 'Loading…' : `Hello, ${firstName}`}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-white/35">
              {isLoading
                ? 'Fetching your documents'
                : total === 0
                ? 'Upload your first document to get started'
                : `${total} document${total !== 1 ? 's' : ''} in your workspace`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {usage && <AIRing usage={usage} />}
            <Link
              href="/upload"
              className="group inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 hover:-translate-y-0.5 transition-all active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Document</span>
              <span className="sm:hidden">New</span>
            </Link>
          </div>
        </div>

        {/* ── Stats label ─────────────────────────────────────────────── */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Overview</span>
          </div>
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/[0.06]" />
        </div>

        {/* ── Stats row ───────────────────────────────────────────────── */}
        <div className="mb-5 grid grid-cols-2 gap-8 sm:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
            : stats.map((s) => (
                <CardSpotlight key={s.label} className="p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/25">{s.label}</p>
                    <s.icon className={cn('h-3.5 w-3.5', s.accent)} />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{s.value}</p>
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-white/25">{s.sub}</p>
                </CardSpotlight>
              ))}
        </div>

        {/* ── Premium section ─────────────────────────────────────── */}
        <div className="mb-8 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-white to-indigo-50 p-5 dark:border-amber-500/20 dark:from-amber-500/10 dark:via-[#0d0d1a] dark:to-indigo-500/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-100/70 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                <Crown className="h-3.5 w-3.5" /> Premium Access
              </p>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {isPremium ? 'You are on Pro plan' : 'Unlock Pro tools'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-white/45">
                {isPremium
                  ? 'All premium features are active, including AI narration and PPT export.'
                  : 'Free plan excludes AI narration, TTS narration, grammar fix, humanize, and PowerPoint export.'}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/60">AI Teleprompter</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/60">TTS Narration</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/60">Export PPT</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/60">Grammar Fix</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/60">Humanize</span>
              </div>
            </div>
            <Link
              href="/pricing"
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                isPremium
                  ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.07]'
                  : 'bg-amber-500 text-white shadow-lg shadow-amber-500/25 hover:bg-amber-400',
              )}
            >
              <Crown className="h-4 w-4" />
              {isPremium ? 'Manage Plan' : 'Go Premium'}
            </Link>
          </div>
        </div>

        {/* ── Documents label ──────────────────────────────────────────── */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Documents</span>
          </div>
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/[0.06]" />
          <span className="text-[11px] font-semibold text-slate-400 dark:text-white/30">
            {!isLoading && `${sortedFiltered.length} of ${textDocs.length}`}
          </span>
        </div>

        {/* ── Document list ────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.3] bg-white/70 backdrop-blur-sm dark:bg-white/[0.02] overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-white/[0.08]">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 dark:text-white/20 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents…"
                className="w-full rounded-lg bg-slate-50 dark:bg-white/[0.03] pl-8 pr-3 py-1.5 text-xs text-slate-700 dark:text-white/80 placeholder:text-slate-300 dark:placeholder:text-white/20 border border-slate-200 dark:border-white/[0.05] focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500/40 focus:bg-white dark:focus:bg-white/[0.05] transition-colors"
              />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-300 dark:text-white/20 mr-1 flex-shrink-0" />
              {(['recent', 'name', 'score'] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => setSortBy(val)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all',
                    sortBy === val
                      ? 'bg-indigo-600 text-white dark:bg-indigo-600/80'
                      : 'text-slate-400 dark:text-white/25 hover:text-slate-700 dark:hover:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]',
                  )}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Column headers */}
          {!isLoading && sortedFiltered.length > 0 && (
            <div className="hidden sm:flex items-center px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/20 border-b border-slate-200 dark:border-white/[0.08]">
              <span className="flex-1">Document</span>
              <span className="mr-[90px]">Scores</span>
            </div>
          )}

          {/* Rows */}
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
          ) : sortedFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10">
                <Upload className="h-7 w-7 text-indigo-500 dark:text-indigo-400" />
              </div>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900 dark:text-white">
                {query ? 'No results' : 'No documents yet'}
              </h3>
              <p className="mb-6 max-w-xs text-sm text-slate-400 dark:text-white/30 leading-relaxed">
                {query
                  ? `No documents match "${query}".`
                  : 'Upload a Word doc, PDF, plain text, or a YouTube link to begin AI analysis.'}
              </p>
              {!query && (
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Upload your first document
                </Link>
              )}
            </div>
          ) : (
            <ul>
              {sortedFiltered.map((doc, idx) => (
                <DocRow
                  key={doc._id}
                  doc={doc}
                  isLast={idx === sortedFiltered.length - 1}
                  deletingId={deletingId}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}

          {/* Footer */}
          {!isLoading && sortedFiltered.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <p className="text-[11px] text-slate-400 dark:text-white/20">
                {sortedFiltered.length} document{sortedFiltered.length !== 1 ? 's' : ''}
                {query && <> matching <span className="text-slate-600 dark:text-white/35">&ldquo;{query}&rdquo;</span></>}
              </p>
              <Link
                href="/upload"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-500 dark:text-indigo-400/60 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
              >
                <Plus className="h-3 w-3" /> Add document
              </Link>
            </div>
          )}
        </div>

        {/* ── Media Library section ─────────────────────────────────── */}
        {!isLoading && mediaDocs.length > 0 && (
          <>
            <div className="mt-10 mb-4 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-pink-500" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-pink-500 dark:text-pink-400">Media Library</span>
              </div>
              <div className="h-px flex-1 bg-slate-200 dark:bg-white/[0.06]" />
              <span className="text-[11px] font-semibold text-slate-400 dark:text-white/30">{mediaDocs.length} item{mediaDocs.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {mediaDocs.map((doc) => (
                <MediaCard
                  key={doc._id}
                  doc={doc}
                  deletingId={deletingId}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </>
        )}

      </main>

      <Footer />
    </div>
  );
}