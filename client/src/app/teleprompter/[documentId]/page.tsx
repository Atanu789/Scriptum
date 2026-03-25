'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TeleprompterEngine from '@/components/TeleprompterEngine';
import { useDocument } from '@/hooks/useDocument';
import { sanitizeContent } from '@/lib/sanitize';
import { documentApi } from '@/lib/api';
import type { DocumentSummary } from '@/types';
import { Loader2, AlertCircle, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';

function isMongoId(value: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(value);
}

function normalizeListNumbering(text: string): string {
  return text
    // 01. Item  ->  1. Item (including indented lines)
    .replace(/(^|\n)(\s*)0+(\d+)([.)]\s+)/g, '$1$2$3$4')
    // 01. (without trailing text yet) -> 1.
    .replace(/(^|\n)(\s*)0+(\d+)([.)]$)/g, '$1$2$3$4');
}

function normalizeZeroWrappedWords(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Remove standalone zero tokens before words: "0 Cellular" -> "Cellular".
    .replace(/(^|\s)0+(?=\s+[A-Za-z])/g, '$1')
    // Remove zero(s) before words, including punctuated forms like "(0Cellular".
    .replace(/(^|[^A-Za-z0-9'])0+(?=[A-Za-z])/g, '$1')
    // Remove trailing zero(s) after words, including punctuated forms like "Think0)".
    .replace(/(?<=[A-Za-z])0+(?=($|[^A-Za-z0-9']))/g, '');
}

function toTeleprompterScript(input: string): string {
  const safe = sanitizeContent(input || '');
  if (!safe.trim()) return '';

  // If there are no tags, treat as plain text and preserve line breaks.
  if (!/[<>]/.test(safe)) {
    const normalized = safe
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return normalizeZeroWrappedWords(normalizeListNumbering(normalized));
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(safe, 'text/html');
  const lines: string[] = [];

  const pushLine = (value: string) => {
    const clean = value.replace(/[ \t]+/g, ' ').trim();
    if (!clean) return;
    lines.push(clean);
  };

  const rootBlocks = Array.from(doc.body.children);
  if (rootBlocks.length === 0) {
    pushLine(doc.body.textContent || '');
  } else {
    for (const block of rootBlocks) {
      const tag = block.tagName.toLowerCase();

      if (tag === 'ol') {
        const items = Array.from(block.querySelectorAll(':scope > li'));
        items.forEach((li, idx) => pushLine(`${idx + 1}. ${li.textContent || ''}`));
        lines.push('');
        continue;
      }

      if (tag === 'ul') {
        const items = Array.from(block.querySelectorAll(':scope > li'));
        items.forEach((li) => pushLine(`- ${li.textContent || ''}`));
        lines.push('');
        continue;
      }

      if (tag === 'p' || /^h[1-6]$/.test(tag) || tag === 'blockquote' || tag === 'pre') {
        pushLine(block.textContent || '');
        lines.push('');
        continue;
      }

      pushLine(block.textContent || '');
    }
  }

  const withBreaks = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();

  return normalizeZeroWrappedWords(normalizeListNumbering(withBreaks));
}

export default function TeleprompterPage() {
  const params = useParams<{ documentId: string }>();
  const router = useRouter();
  const routeDocumentId = Array.isArray(params.documentId)
    ? params.documentId[0] || ''
    : (params.documentId || '');
  const { document, isLoading, error } = useDocument(routeDocumentId);
  const [availableDocs, setAvailableDocs] = useState<DocumentSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState(routeDocumentId);
  const [pastedText, setPastedText] = useState('');
  const [importedScript, setImportedScript] = useState('');
  const [importedTitle, setImportedTitle] = useState('');
  const [showPasteWindow, setShowPasteWindow] = useState(false);

  useEffect(() => {
    setSelectedDocId(routeDocumentId);
  }, [routeDocumentId]);

  useEffect(() => {
    if (!routeDocumentId.trim() || !isMongoId(routeDocumentId)) {
      router.replace('/teleprompter');
    }
  }, [routeDocumentId, router]);

  useEffect(() => {
    let mounted = true;
    void documentApi
      .list(1, 100)
      .then(({ documents }) => {
        if (mounted) setAvailableDocs(documents);
      })
      .catch(() => {
        // Keep teleprompter usable even if document picker fails.
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (document) return;
    if (availableDocs.length === 0) return;
    if (!routeDocumentId || !isMongoId(routeDocumentId) || error) {
      const nextId = availableDocs[0]?._id;
      if (nextId && nextId !== routeDocumentId) {
        router.replace(`/teleprompter/${nextId}`);
      }
    }
  }, [availableDocs, document, error, isLoading, routeDocumentId, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070f]">
        <Loader2 suppressHydrationWarning className="h-7 w-7 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#07070f] text-white">
        <AlertCircle suppressHydrationWarning className="h-10 w-10 text-red-400" />
        <p className="text-sm text-white/50">{error || 'Document not found'}</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.07] px-4 py-2 text-sm font-medium text-white/50 transition-colors hover:border-white/[0.12] hover:text-white/80"
        >
          <ChevronLeft suppressHydrationWarning className="h-3.5 w-3.5" /> Dashboard
        </Link>
      </div>
    );
  }

  const script = toTeleprompterScript(document.editorHtml || document.cleanedText || document.rawText);
  const effectiveScript = importedScript || script;
  const effectiveTitle = importedTitle || document.originalFileName;

  const handlePasteImport = () => {
    const next = toTeleprompterScript(pastedText);
    if (!next.trim()) {
      toast.error('Paste some text before importing');
      return;
    }
    setImportedScript(next);
    setImportedTitle('Pasted text');
    toast.success('Imported pasted text');
  };

  const clearImportedSource = () => {
    setImportedScript('');
    setImportedTitle('');
    setPastedText('');
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#07070f]">
      {/* Top bar */}
      <div className="relative flex items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-white/[0.06] bg-[#07070f]/95 px-3 py-2.5 backdrop-blur-sm sm:px-4">
        <Link
          href="/dashboard"
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
        >
          <ChevronLeft suppressHydrationWarning className="h-3 w-3" /> Dashboard
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <label className="hidden text-[11px] text-white/40 sm:inline">Document</label>
          <button
            onClick={() => setShowPasteWindow((prev) => !prev)}
            className="min-h-[36px] shrink-0 rounded-md border border-white/15 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.09]"
          >
            Paste text
          </button>
          <select
            value={selectedDocId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedDocId(nextId);
              if (nextId && nextId !== routeDocumentId) {
                clearImportedSource();
                router.push(`/teleprompter/${nextId}`);
              }
            }}
            className="min-h-[36px] w-[170px] shrink-0 rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/80 focus:border-indigo-500/60 focus:outline-none sm:w-[240px]"
          >
            {availableDocs.map((doc) => (
              <option key={doc._id} value={doc._id} className="bg-[#0f1020] text-white">
                {doc.originalFileName}
              </option>
            ))}
          </select>
          {importedScript && (
            <button
              onClick={clearImportedSource}
              className="min-h-[36px] shrink-0 rounded-md border border-white/15 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.09]"
            >
              Use document text
            </button>
          )}
        </div>

      </div>

      {showPasteWindow && (
        <div
          className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[1px]"
          onClick={() => setShowPasteWindow(false)}
        >
          <div
            className="absolute left-2 right-2 top-14 rounded-xl border border-white/15 bg-[#0f1020] p-3 shadow-xl sm:left-auto sm:right-4 sm:w-[360px]"
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={5}
              placeholder="Paste text here"
              className="w-full rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-2 text-xs text-white/80 focus:border-indigo-500/60 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteWindow(false)}
                className="min-h-[32px] rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.09]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handlePasteImport();
                  setShowPasteWindow(false);
                }}
                className="min-h-[32px] rounded-md border border-sky-500/30 bg-sky-500/20 px-2.5 py-1 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/30"
              >
                Apply text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Engine — fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <TeleprompterEngine
          script={effectiveScript}
          documentTitle={effectiveTitle}
        />
      </div>
    </div>
  );
}

