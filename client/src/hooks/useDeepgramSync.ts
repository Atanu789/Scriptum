'use client';

import { useRef, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'error'
  | 'stopped';

export interface UseDeepgramSyncOptions {
  /** Called with each transcript chunk (interim or final) */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Called when status changes */
  onStatusChange: (status: SyncStatus) => void;
  /** Called on unrecoverable error */
  onError: (message: string) => void;
  /** Max session duration in ms (default: 15 min) */
  maxDurationMs?: number;
}

export interface UseDeepgramSyncReturn {
  start: () => Promise<void>;
  stop: () => void;
  status: React.MutableRefObject<SyncStatus>;
}

type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{
      isFinal: boolean;
      0: { transcript: string };
    }>;
  }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages the entire Deepgram real-time transcription lifecycle:
 *
 *  1. Fetches a short-lived API key from our backend (/api/deepgram/token)
 *  2. Opens a mic MediaStream
 *  3. Opens a WebSocket to Deepgram's streaming endpoint
 *  4. Pipes mic audio → WS; WS transcription events → onTranscript
 *  5. Enforces max session duration
 *  6. Cleans up on unmount
 */
export function useDeepgramSync(options: UseDeepgramSyncOptions): UseDeepgramSyncReturn {
  const { onTranscript, onStatusChange, onError, maxDurationMs = 15 * 60 * 1000 } = options;

  const statusRef        = useRef<SyncStatus>('idle');
  const recognitionRef   = useRef<BrowserRecognition | null>(null);
  const sessionTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatus = useCallback((s: SyncStatus) => {
    statusRef.current = s;
    onStatusChange(s);
  }, [onStatusChange]);

  // ── Cleanup helper ────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onstart = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.abort();
    }
    recognitionRef.current = null;

    // Clear session timer
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  // ── Start session ─────────────────────────────────────────────────────────

  const start = useCallback(async (): Promise<void> => {
    if (statusRef.current === 'listening' || statusRef.current === 'connecting') return;

    setStatus('connecting');

    try {
      const ctor = (window as typeof window & {
        webkitSpeechRecognition?: new () => BrowserRecognition;
        SpeechRecognition?: new () => BrowserRecognition;
      }).SpeechRecognition || (window as typeof window & { webkitSpeechRecognition?: new () => BrowserRecognition }).webkitSpeechRecognition;

      if (!ctor) {
        throw new Error('Speech recognition not supported in this browser.');
      }

      const recognition = new ctor();
      recognitionRef.current = recognition;
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onstart = () => {
        setStatus('listening');
        sessionTimerRef.current = setTimeout(() => {
          onError('Max session duration reached (15 min). Mic stopped.');
          setStatus('stopped');
          cleanup();
        }, maxDurationMs);
      };

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result?.[0]?.transcript?.trim() || '';
          if (!transcript) continue;
          onTranscript(transcript, result.isFinal);
        }
      };

      recognition.onerror = (event) => {
        const reason = event?.error || 'unknown';
        setStatus('error');
        onError(`Speech recognition failed: ${reason}`);
        cleanup();
      };

      recognition.onend = () => {
        if (statusRef.current !== 'stopped') {
          setStatus('stopped');
        }
        cleanup();
      };

      recognition.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setStatus('error');

      if (message.includes('Permission denied') || message.includes('NotAllowedError') || message.includes('not-allowed')) {
        onError('Microphone permission denied. Please allow mic access and try again.');
      } else {
        onError(message);
      }

      cleanup();
    }
  }, [cleanup, maxDurationMs, onError, onTranscript, setStatus]);

  // ── Stop session ──────────────────────────────────────────────────────────

  const stop = useCallback((): void => {
    setStatus('stopped');
    cleanup();
  }, [cleanup, setStatus]);

  // ── Unmount cleanup ───────────────────────────────────────────────────────

  useEffect(() => () => { cleanup(); }, [cleanup]);

  return { start, stop, status: statusRef };
}
