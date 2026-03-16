'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useDocument } from '@/hooks/useDocument';
import { useSubscription } from '@/hooks/useSubscription';
import { exportApi } from '@/lib/api';
import { downloadBlob } from '@/lib/utils';
import {
  Loader2, AlertCircle, ChevronLeft,
  Presentation, Download, Video, CheckCircle2,
  FileText, FileDown, Lock, Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

type Theme = 'light' | 'dark' | 'professional';

export default function ExportPage() {
  const params = useParams<{ documentId: string }>();
  const { document, isLoading, error } = useDocument(params.documentId);
  const { canUseExportPPT } = useSubscription();

  const [pptOptions, setPptOptions] = useState({
    title: '',
    theme: 'professional' as Theme,
    includeNotes: false,
  });
  const [isExportingPpt, setIsExportingPpt] = useState(false);
  const [pptDone, setPptDone] = useState(false);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfDone, setPdfDone] = useState(false);

  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [docxDone, setDocxDone] = useState(false);

  const getTitle = () =>
    pptOptions.title || document?.originalFileName.replace(/\.[^.]+$/, '') || 'document';

  const safeFileName = (ext: string) =>
    getTitle().replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) + ext;

  const handleExportPpt = async () => {
    if (!document || !canUseExportPPT) return;
    setIsExportingPpt(true);
    setPptDone(false);
    const id = toast.loading('Generating PowerPoint…');
    try {
      const blob = await exportApi.ppt(params.documentId, {
        title: getTitle(),
        theme: pptOptions.theme,
        includeNotes: pptOptions.includeNotes,
      });
      downloadBlob(blob, safeFileName('.pptx'));
      setPptDone(true);
      toast.success('PowerPoint downloaded!', { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id });
    } finally {
      setIsExportingPpt(false);
    }
  };

  const handleExportPdf = async () => {
    if (!document) return;
    setIsExportingPdf(true);
    setPdfDone(false);
    const id = toast.loading('Generating PDF…');
    try {
      const blob = await exportApi.pdf(params.documentId, { title: getTitle() });
      downloadBlob(blob, safeFileName('.pdf'));
      setPdfDone(true);
      toast.success('PDF downloaded!', { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportDocx = async () => {
    if (!document) return;
    setIsExportingDocx(true);
    setDocxDone(false);
    const id = toast.loading('Generating Word document…');
    try {
      const blob = await exportApi.docx(params.documentId, { title: getTitle() });
      downloadBlob(blob, safeFileName('.docx'));
      setDocxDone(true);
      toast.success('Word document downloaded!', { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id });
    } finally {
      setIsExportingDocx(false);
    }
  };

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  /* ── Error ── */
  if (error || !document) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p>{error || 'Document not found'}</p>
        <Link href="/dashboard" className="btn-secondary">
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="animate-page-in mx-auto max-w-3xl px-4 py-8 pb-28 sm:px-6">
        <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/dashboard" className="hover:text-brand-600">Dashboard</Link>
          <span>/</span>
          <Link href={`/editor/${params.documentId}`} className="hover:text-brand-600">Editor</Link>
          <span>/</span>
          <span className="text-slate-700 dark:text-slate-300">Export</span>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">Export Document</h1>
        <p className="mb-8 text-sm text-slate-500">
          {document.originalFileName} · {document.wordCount} words
        </p>

        <div className="space-y-6">

          {/* ── PowerPoint Export ── */}
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-950/30">
                <Presentation className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">PowerPoint Presentation</h2>
                <p className="text-sm text-slate-500">Auto-generated slides from your document sections</p>
              </div>
              {!canUseExportPPT && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                  <Lock className="h-3 w-3" /> Premium
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Presentation Title</label>
                <input
                  type="text"
                  className="input"
                  placeholder={document.originalFileName.replace(/\.[^.]+$/, '')}
                  value={pptOptions.title}
                  disabled={!canUseExportPPT}
                  onChange={(e) => setPptOptions((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Theme</label>
                <select
                  className="input"
                  value={pptOptions.theme}
                  disabled={!canUseExportPPT}
                  onChange={(e) => setPptOptions((p) => ({ ...p, theme: e.target.value as Theme }))}
                >
                  <option value="professional">Professional (Recommended)</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={pptOptions.includeNotes}
                disabled={!canUseExportPPT}
                onChange={(e) => setPptOptions((p) => ({ ...p, includeNotes: e.target.checked }))}
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Include speaker notes (narration text)
              </span>
            </label>

            <button
              onClick={handleExportPpt}
              disabled={isExportingPpt || !canUseExportPPT}
              className={cn('btn-primary', pptDone && 'bg-green-600 hover:bg-green-700')}
            >
              {!canUseExportPPT ? (
                <><Lock className="h-4 w-4" /> Go Premium to export .pptx</>
              ) : isExportingPpt ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              ) : pptDone ? (
                <><CheckCircle2 className="h-4 w-4" /> Downloaded!</>
              ) : (
                <><Download className="h-4 w-4" /> Export as .pptx</>
              )}
            </button>

            {!canUseExportPPT && (
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
              >
                <Crown className="h-4 w-4" /> Go Premium
              </Link>
            )}
          </div>

          {/* ── Video Export (future) ── */}
          <div className="card space-y-4 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/30">
                <Video className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900 dark:text-white">Narrated Video</h2>
                  <span className="badge bg-slate-100 text-slate-500 dark:bg-slate-700">Coming in Phase 3</span>
                </div>
                <p className="text-sm text-slate-500">
                  Auto-generate a narrated video with slides and TTS audio via Remotion
                </p>
              </div>
            </div>
            <button disabled className="btn-secondary cursor-not-allowed">
              <Video className="h-4 w-4" /> Export as Video — Coming Soon
            </button>
          </div>

          {/* ── PDF Export ── */}
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/30">
                <FileDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">PDF Document</h2>
                <p className="text-sm text-slate-500">Clean, formatted PDF with title page and sections</p>
              </div>
            </div>
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className={cn('btn-primary', pdfDone && 'bg-green-600 hover:bg-green-700')}
            >
              {isExportingPdf ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
              ) : pdfDone ? (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Downloaded!</>
              ) : (
                <><Download className="h-3.5 w-3.5" /> Export as .pdf</>
              )}
            </button>
          </div>

          {/* ── DOCX Export ── */}
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/30">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">Word Document</h2>
                <p className="text-sm text-slate-500">Structured DOCX with headings and formatted text</p>
              </div>
            </div>
            <button
              onClick={handleExportDocx}
              disabled={isExportingDocx}
              className={cn('btn-primary', docxDone && 'bg-green-600 hover:bg-green-700')}
            >
              {isExportingDocx ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
              ) : docxDone ? (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Downloaded!</>
              ) : (
                <><Download className="h-3.5 w-3.5" /> Export as .docx</>
              )}
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}

