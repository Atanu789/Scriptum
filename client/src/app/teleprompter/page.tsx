'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { documentApi } from '@/lib/api';
import type { DocumentSummary } from '@/types';
import { AlertCircle, ChevronLeft, Loader2 } from 'lucide-react';

export default function TeleprompterPickerPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        setLoading(true);
        const { documents: docs } = await documentApi.list(1, 100);
        if (!mounted) return;
        setDocuments(docs);
        if (docs.length > 0) {
          setSelectedDocId(docs[0]._id);
        }
      } catch {
        if (mounted) {
          setError('Unable to load your files right now.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredDocs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((doc) => (doc.originalFileName || '').toLowerCase().includes(needle));
  }, [documents, query]);

  useEffect(() => {
    if (!selectedDocId && filteredDocs.length > 0) {
      setSelectedDocId(filteredDocs[0]._id);
      return;
    }

    if (selectedDocId && !filteredDocs.some((doc) => doc._id === selectedDocId)) {
      setSelectedDocId(filteredDocs[0]?._id || '');
    }
  }, [filteredDocs, selectedDocId]);

  const openTeleprompter = () => {
    if (!selectedDocId) return;
    router.push(`/teleprompter/${selectedDocId}`);
  };

  return (
    <main className="min-h-screen bg-[#07070f] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/[0.16] hover:text-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
        </div>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
          <h1 className="text-lg font-semibold text-white">Choose A File For Teleprompter</h1>
          <p className="mt-1 text-xs text-white/55">Select your script file, then open teleprompter mode.</p>

          {loading && (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-white/70">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading files...
            </div>
          )}

          {!loading && error && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          {!loading && !error && documents.length === 0 && (
            <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white/70">
              No files found. Upload or create a document first.
            </div>
          )}

          {!loading && !error && documents.length > 0 && (
            <div className="mt-4 space-y-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white outline-none transition-colors focus:border-indigo-500/60"
              />

              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="h-10 w-full rounded-lg border border-white/15 bg-[#0e0f1b] px-3 text-sm text-white outline-none transition-colors focus:border-indigo-500/60"
              >
                {filteredDocs.map((doc) => (
                  <option key={doc._id} value={doc._id}>
                    {doc.originalFileName}
                  </option>
                ))}
              </select>

              <button
                onClick={openTeleprompter}
                disabled={!selectedDocId}
                className="h-10 rounded-lg border border-indigo-500/40 bg-indigo-500/20 px-4 text-sm font-semibold text-indigo-200 transition-colors hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open Teleprompter
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
