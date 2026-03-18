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

function normalizeListNumbering(text: string): string {
  return text.replace(/(^|\n)0+(\d+)([.)]\s+)/g, '$1$2$3');
}

function toTeleprompterScript(input: string): string {
  const safe = sanitizeContent(input || '');
  if (!safe.trim()) return '';

  // If there are no tags, treat as plain text and preserve line breaks.
  if (!/[<>]/.test(safe)) {
    return normalizeListNumbering(
      safe
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    );
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

  return normalizeListNumbering(withBreaks);
}

export default function TeleprompterPage() {
  const params = useParams<{ documentId: string }>();
  const router = useRouter();
  const { document, isLoading, error } = useDocument(params.documentId);
  const [availableDocs, setAvailableDocs] = useState<DocumentSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState(params.documentId);

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
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#07070f] text-white">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-white/50">{error || 'Document not found'}</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.07] px-4 py-2 text-sm font-medium text-white/50 transition-colors hover:border-white/[0.12] hover:text-white/80"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
      </div>
    );
  }

  const script = toTeleprompterScript(document.editorHtml || document.cleanedText || document.rawText);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#07070f]">
      {/* Back nav */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.04] bg-[#07070f] px-4 py-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/25 transition-colors hover:bg-white/[0.04] hover:text-white/50"
        >
          <ChevronLeft className="h-3 w-3" /> Dashboard
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-[11px] text-white/40">Import document</label>
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="max-w-[220px] rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/80 focus:border-indigo-500/50 focus:outline-none"
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
                router.push(`/teleprompter/${selectedDocId}`);
              }
            }}
            disabled={!selectedDocId || selectedDocId === params.documentId}
            className="rounded-md border border-indigo-500/30 bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>

      {/* Engine — fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <TeleprompterEngine
          script={script}
          documentTitle={document.originalFileName}
        />
      </div>
    </div>
  );
}

