'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadApi } from '@/lib/api';
import { useSubscription } from '@/hooks/useSubscription';
import { motion } from 'framer-motion';
import { AceFileUpload } from '@/components/ui/ace-file-upload';
import { ShimmerButton } from '@/components/ui/ace-input';
import { MeteorCard } from '@/components/ui/meteor-card';
import { BackgroundDots } from '@/components/ui/background-dots';
import {
  ArrowLeft, ArrowRight, Loader2, AlertCircle,
  FileType, File as FileIcon, FileText, Globe,
  Image as ImageIcon, Music, Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

type UploadMode = 'document' | 'media' | 'website';

// ─── Accepted MIME → extension maps ──────────────────────────────────────────

const DOCUMENT_ACCEPT = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
};

const MEDIA_ACCEPT = {
  'image/jpeg':  ['.jpg', '.jpeg'],
  'image/png':   ['.png'],
  'image/gif':   ['.gif'],
  'image/webp':  ['.webp'],
  'audio/mpeg':  ['.mp3'],
  'audio/mp4':   ['.m4a'],
  'audio/x-m4a': ['.m4a'],
  'video/mp4':   ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm':  ['.webm'],
  'video/x-msvideo': ['.avi'],
};

const DOC_MAX   = 25 * 1024 * 1024;   // 25 MB
const MEDIA_MAX = 100 * 1024 * 1024;  // 100 MB

const DOCUMENT_PILLS = [
  { icon: FileType,  label: '.docx', color: 'text-blue-500' },
  { icon: FileIcon,  label: '.pdf',  color: 'text-red-500'  },
  { icon: FileText,  label: '.txt',  color: 'text-slate-400' },
  { icon: FileIcon,  label: '.pptx', color: 'text-orange-500' },
];

const MEDIA_PILLS = [
  { icon: ImageIcon, label: '.jpg / .jpeg / .png', color: 'text-pink-500' },
  { icon: Music,     label: '.mp3 / .m4a',         color: 'text-green-500' },
  { icon: Video,     label: '.mp4 / .mov / .webm', color: 'text-purple-500' },
];

const WEBSITE_EXAMPLES = ['medium.com/…', 'substack.com/…', 'dev.to/…', 'any blog URL'];

export default function UploadPage() {
  const router = useRouter();
  const {
    uploadUsed,
    uploadLimit,
    uploadRemaining,
    uploadBlocked,
  } = useSubscription();
  const [mode, setMode]               = useState<UploadMode>('document');
  const [websiteUrl, setWebsiteUrl]   = useState('');
  const [file, setFile]               = useState<File | null>(null);
  const [progress, setProgress]       = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const handleUpload = async () => {
    setError(null);

    if (uploadBlocked) {
      toast.error('Upload limit reached. Upgrade to Premium to continue.');
      router.push('/pricing');
      return;
    }

    setIsUploading(true);
    setProgress(0);
    try {
      let result;
      if (mode === 'website') {
        if (!websiteUrl.trim()) { setError('Please enter a website URL'); return; }
        toast.loading('Scraping website content…', { id: 'upload' });
        result = await uploadApi.uploadWebsite(websiteUrl.trim());
      } else {
        if (!file) { setError('Please select a file'); return; }
        const isMedia = mode === 'media';
        toast.loading(isMedia ? 'Importing media…' : 'Processing…', { id: 'upload' });
        result = await uploadApi.uploadFile(file, (p) => setProgress(p));
      }
      toast.success(mode === 'media' ? 'Media imported!' : 'Processed successfully!', { id: 'upload' });
      router.push(`/editor/${result.documentId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      toast.error(msg, { id: 'upload' });
      if (msg.toLowerCase().includes('upload limit') || msg.toLowerCase().includes('upgrade')) {
        router.push('/pricing');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const canSubmit = !isUploading && (
    mode === 'website' ? !!websiteUrl.trim() : !!file
  );

  const tabs: { id: UploadMode; label: string; icon: React.ReactNode }[] = [
    { id: 'document', label: 'Document',      icon: <FileText className="h-4 w-4" /> },
    { id: 'media',    label: 'Image / Video',  icon: <ImageIcon className="h-4 w-4" /> },
    { id: 'website',  label: 'Website / Blog', icon: <Globe className="h-4 w-4" /> },
  ];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden px-4 pb-32 pt-16">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 70%)' }}
      />
      <BackgroundDots gap={22} dotSize={1} className="fixed inset-0 -z-10 dark:opacity-100 opacity-50" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-xl"
      >
        {/* Back link */}
        <div className="mb-6">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-all hover:bg-slate-100/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </a>
        </div>

        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Upload Content
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Upload a document, image, audio / video, or scrape any blog or article
          </p>
          <div className={cn(
            'mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
            uploadBlocked
              ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
              : 'border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300',
          )}>
            Uploads this month: {uploadLimit === -1 ? `${uploadUsed}/∞` : `${uploadUsed}/${uploadLimit}`}
            {uploadLimit !== -1 && <> · {uploadRemaining} remaining</>}
            {uploadBlocked && <> · Premium required</>}
          </div>
        </div>

        <MeteorCard meteors={6} className="w-full">
          <div className="space-y-6 p-2">

            {/* Mode tabs */}
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setMode(t.id); setFile(null); setError(null); }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium transition-all',
                    mode === t.id
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white',
                  )}
                >
                  {t.icon}
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">
                    {t.id === 'document' ? 'Doc' : t.id === 'media' ? 'Media' : 'Web'}
                  </span>
                </button>
              ))}
            </div>

            {/* ── Document mode ── */}
            {mode === 'document' && (
              <div className="space-y-4">
                <AceFileUpload
                  accept={DOCUMENT_ACCEPT}
                  maxSize={DOC_MAX}
                  onFile={setFile}
                  onClear={() => setFile(null)}
                  file={file}
                  disabled={isUploading}
                />
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {DOCUMENT_PILLS.map((f) => (
                    <div key={f.label} className="flex items-center gap-1.5 text-xs text-slate-400">
                      <f.icon className={cn('h-3.5 w-3.5', f.color)} />
                      {f.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Media mode (image / audio / video) ── */}
            {mode === 'media' && (
              <div className="space-y-4">
                <AceFileUpload
                  accept={MEDIA_ACCEPT}
                  maxSize={MEDIA_MAX}
                  onFile={setFile}
                  onClear={() => setFile(null)}
                  file={file}
                  disabled={isUploading}
                />
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {MEDIA_PILLS.map((f) => (
                    <div key={f.label} className="flex items-center gap-1.5 text-xs text-slate-400">
                      <f.icon className={cn('h-3.5 w-3.5', f.color)} />
                      {f.label}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 dark:border-indigo-500/15 dark:bg-indigo-950/15">
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                    <span className="font-semibold">Tip:</span> Images and videos are stored as media attachments. You can embed them anywhere in the document editor.
                  </p>
                </div>
              </div>
            )}

            {/* ── Website / Blog mode ── */}
            {mode === 'website' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Blog or Article URL
                  </label>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Paste any public blog post or article — we&apos;ll scrape &amp; structure the text for you
                  </p>
                </div>

                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="url"
                    className={cn(
                      'w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900',
                      'placeholder:text-slate-400 outline-none transition-all',
                      'focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20',
                      'dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30',
                    )}
                    placeholder="https://medium.com/your-article"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text').trim();
                      if (pasted.startsWith('http')) {
                        e.preventDefault();
                        setWebsiteUrl(pasted);
                      }
                    }}
                    disabled={isUploading}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Works with:</span>
                  {WEBSITE_EXAMPLES.map((ex) => (
                    <span
                      key={ex}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-white/6 dark:text-slate-400"
                    >
                      {ex}
                    </span>
                  ))}
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/15 dark:bg-amber-950/15">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    <span className="font-semibold">Note:</span> Pages behind a login, paywall, or that require JavaScript may not extract correctly.
                  </p>
                </div>
              </div>
            )}

            {/* Upload progress bar */}
            {isUploading && mode !== 'website' && progress > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-1.5"
              >
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Uploading…</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-indigo-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </motion.div>
            )}

            {/* Scraping indicator */}
            {isUploading && mode === 'website' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
              >
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                Fetching and parsing page content…
              </motion.div>
            )}

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-400"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </motion.div>
            )}

            {uploadBlocked && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-300">
                Upload limit reached for your current plan.
                <button
                  type="button"
                  onClick={() => router.push('/pricing')}
                  className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-400"
                >
                  Go Premium <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Submit */}
            <ShimmerButton onClick={handleUpload} disabled={!canSubmit || uploadBlocked}>
              {isUploading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {mode === 'media' ? 'Importing…' : 'Processing…'}</>
                : uploadBlocked
                  ? <>Go Premium <ArrowRight className="h-4 w-4" /></>
                : mode === 'media'
                  ? <>Import <ArrowRight className="h-4 w-4" /></>
                  : <>Process <ArrowRight className="h-4 w-4" /></>
              }
            </ShimmerButton>
          </div>
        </MeteorCard>
      </motion.div>
    </div>
  );
}

