'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Share2, Twitter, Linkedin, Facebook, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface ShareMenuProps {
  title: string;
  className?: string;
  buttonClassName?: string;
}

function popupShare(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer,width=640,height=720');
}

export default function ShareMenu({ title, className, buttonClassName }: ShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const getShareData = useCallback(() => {
    if (typeof window === 'undefined') return { url: '', encodedUrl: '', encodedTitle: '' };
    const url = window.location.href;
    return {
      url,
      encodedUrl: encodeURIComponent(url),
      encodedTitle: encodeURIComponent(title),
    };
  }, [title]);

  const shareTwitter = useCallback(() => {
    const { encodedUrl, encodedTitle } = getShareData();
    popupShare(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`);
    setIsOpen(false);
  }, [getShareData]);

  const shareLinkedIn = useCallback(() => {
    const { encodedUrl } = getShareData();
    popupShare(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`);
    setIsOpen(false);
  }, [getShareData]);

  const shareFacebook = useCallback(() => {
    const { encodedUrl } = getShareData();
    popupShare(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`);
    setIsOpen(false);
  }, [getShareData]);

  const copyLink = useCallback(async () => {
    const { url } = getShareData();
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
      setIsOpen(false);
    } catch {
      toast.error('Could not copy link');
    }
  }, [getShareData]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (evt: MouseEvent) => {
      const target = evt.target as Node;
      if (!wrapRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-slate-600 backdrop-blur-sm transition-all hover:bg-white',
          'dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/50 dark:hover:bg-white/[0.07]',
          buttonClassName,
        )}
      >
        <Share2 className="h-3.5 w-3.5 text-indigo-500" />
        Share
      </button>

      {isOpen && (
        <div className="absolute right-0 z-40 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={shareTwitter}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Twitter className="h-3.5 w-3.5 text-sky-500" /> Twitter
          </button>
          <button
            type="button"
            onClick={shareLinkedIn}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Linkedin className="h-3.5 w-3.5 text-blue-600" /> LinkedIn
          </button>
          <button
            type="button"
            onClick={shareFacebook}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Facebook className="h-3.5 w-3.5 text-blue-500" /> Facebook
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Link2 className="h-3.5 w-3.5 text-violet-500" /> Copy Link
          </button>
        </div>
      )}
    </div>
  );
}
