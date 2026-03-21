'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TeleprompterEngine from '@/components/TeleprompterEngine';
import { useDocument } from '@/hooks/useDocument';
import { sanitizeContent } from '@/lib/sanitize';
import { documentApi } from '@/lib/api';
import type { DocumentSummary } from '@/types';
import { importFileToHtml } from '@/components/problem-editor/utils';
import { Loader2, AlertCircle, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';

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
  const { document, isLoading, error } = useDocument(params.documentId);
  const [availableDocs, setAvailableDocs] = useState<DocumentSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState(params.documentId);
  const [pastedText, setPastedText] = useState('');
  const [importedScript, setImportedScript] = useState('');
  const [importedTitle, setImportedTitle] = useState('');
  const [isImportingFile, setIsImportingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedDocId(params.documentId);
  }, [params.documentId]);

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

  const handleLocalFileImport = async (file: File) => {
    try {
      setIsImportingFile(true);
      const html = await importFileToHtml(file);
      const next = toTeleprompterScript(html);
      if (!next.trim()) {
        toast.error('Could not extract readable text from this file');
        return;
      }
      setImportedScript(next);
      setImportedTitle(file.name);
      toast.success('Imported local file');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import file';
      toast.error(msg);
    } finally {
      setIsImportingFile(false);
    }
  };

  const clearImportedSource = () => {
    setImportedScript('');
    setImportedTitle('');
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#07070f]">
      {/* Back nav */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#07070f]/95 px-3 py-2.5 backdrop-blur-sm sm:px-4">
        <Link
          href="/dashboard"
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
        >
          <ChevronLeft suppressHydrationWarning className="h-3 w-3" /> Dashboard
        </Link>

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <label className="hidden text-[11px] text-white/40 sm:inline">Import document</label>
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="min-h-[36px] w-full sm:w-[240px] rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/80 focus:border-indigo-500/60 focus:outline-none"
          >
            {availableDocs.map((doc) => (
              <option key={doc._id} value={doc._id} className="bg-[#0f1020] text-white">
                {doc.originalFileName}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (selectedDocId && selectedDocId !== params.documentId) {
                clearImportedSource();
                router.push(`/teleprompter/${selectedDocId}`);
              }
            }}
            disabled={!selectedDocId || selectedDocId === params.documentId}
            className="min-h-[36px] rounded-md border border-indigo-500/30 bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import
          </button>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleLocalFileImport(file);
              }
              e.currentTarget.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImportingFile}
            className="min-h-[34px] rounded-md border border-emerald-500/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImportingFile ? 'Importing file...' : 'Import local file'}
          </button>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={2}
            placeholder="Paste text here and click Import pasted text"
            className="min-h-[34px] flex-1 rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/80 focus:border-indigo-500/60 focus:outline-none"
          />
          <button
            onClick={handlePasteImport}
            className="min-h-[34px] rounded-md border border-sky-500/30 bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/30"
          >
            Import pasted text
          </button>
          {importedScript && (
            <button
              onClick={clearImportedSource}
              className="min-h-[34px] rounded-md border border-white/15 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.09]"
            >
              Clear imported source
            </button>
          )}
        </div>
      </div>

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

