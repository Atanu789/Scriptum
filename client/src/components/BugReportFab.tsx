'use client';

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertCircle, X } from 'lucide-react';
import { supportApi } from '@/lib/api';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read screenshot file'));
    reader.readAsDataURL(file);
  });
}

export default function BugReportFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const currentPage = useMemo(() => pathname || '/', [pathname]);

  const onScreenshotChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setScreenshot('');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Screenshot must be under 2MB.');
      return;
    }

    try {
      const encoded = await fileToDataUrl(file);
      setScreenshot(encoded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load screenshot');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      await supportApi.reportBug({
        description: description.trim(),
        page: currentPage,
        screenshot: screenshot || undefined,
      });
      setSuccess('Bug report submitted. Thank you.');
      setDescription('');
      setScreenshot('');
      window.setTimeout(() => setOpen(false), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit bug report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-red-700 px-4 text-sm font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-800 sm:bottom-7"
      >
        <AlertCircle className="h-4 w-4" />
        
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/[0.08] dark:bg-[#10131f]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Report a bug</h3>
                <p className="text-xs text-slate-500 dark:text-white/45">Page auto-detected: {currentPage}</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.08]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                required
                minLength={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue, expected behavior, and what happened..."
                className="min-h-[130px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-white"
              />

              <label className="block text-xs font-medium text-slate-600 dark:text-white/65">
                Screenshot (optional)
                <input
                  type="file"
                  accept="image/*"
                  onChange={onScreenshotChange}
                  className="mt-1 block w-full text-xs"
                />
              </label>

              {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
              {success && <p className="text-xs text-emerald-600 dark:text-emerald-300">{success}</p>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-10 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
