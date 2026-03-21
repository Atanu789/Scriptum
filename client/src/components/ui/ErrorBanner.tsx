'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onClose?: () => void;
}

export function ErrorBanner({ message, onRetry, onClose }: ErrorBannerProps) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">AI temporarily busy, retrying with backup engine...</p>
          <p className="mt-0.5 text-xs opacity-90">{message}</p>
        </div>
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-500"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="text-xs font-semibold opacity-75 hover:opacity-100">Dismiss</button>
          )}
        </div>
      </div>
    </div>
  );
}
