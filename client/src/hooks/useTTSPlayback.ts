'use client';

import { useRef, useCallback, useEffect } from 'react';
import { Token } from './useScriptTokens';

const WORDS_PER_CHUNK = 150;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export type TTSStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'done';

export interface UseTTSPlaybackOptions {
  tokens:          Token[];
  script:          string;
  onPointerChange: (index: number) => void;
  onStatusChange:  (status: TTSStatus) => void;
  onError:         (msg: string) => void;
}

export interface UseTTSPlaybackReturn {
  start:  () => Promise<void>;
  pause:  () => void;
  resume: () => void;
  stop:   () => void;
}

function chunkTokens(tokens: Token[], size: number): Token[][] {
  const out: Token[][] = [];
  for (let i = 0; i < tokens.length; i += size) out.push(tokens.slice(i, i + size));
  return out.length > 0 ? out : [tokens];
}

export function useTTSPlayback({
  tokens,
  script: _script,
  onPointerChange,
  onStatusChange,
  onError,
}: UseTTSPlaybackOptions): UseTTSPlaybackReturn {

  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const isActiveRef = useRef(false);
  const isPausedRef = useRef(false);
  const statusRef   = useRef<TTSStatus>('idle');
  const resumeWaitersRef = useRef<Array<() => void>>([]);

  // Keep latest callbacks in refs so helpers never rebuild on re-render.
  const onPointerRef = useRef(onPointerChange);
  const onStatusRef  = useRef(onStatusChange);
  const onErrorRef   = useRef(onError);
  const tokensRef    = useRef(tokens);

  useEffect(() => { onPointerRef.current = onPointerChange; }, [onPointerChange]);
  useEffect(() => { onStatusRef.current  = onStatusChange;  }, [onStatusChange]);
  useEffect(() => { onErrorRef.current   = onError;         }, [onError]);
  useEffect(() => { tokensRef.current    = tokens;          }, [tokens]);

  const setStatus = useCallback((s: TTSStatus) => {
    statusRef.current = s;
    onStatusRef.current(s);
  }, []);

  const clearAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.ontimeupdate = null;
      audioRef.current.onended      = null;
      audioRef.current.onerror      = null;
      audioRef.current.src          = '';
      audioRef.current              = null;
    }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    isPausedRef.current = false;
    resumeWaitersRef.current.forEach((resume) => resume());
    resumeWaitersRef.current = [];
  }, []);

  const waitUntilResumed = useCallback(async (): Promise<void> => {
    if (!isPausedRef.current) return;
    await new Promise<void>((resolve) => {
      resumeWaitersRef.current.push(resolve);
    });
  }, []);

  // ─── Fetch audio blob from server ────────────────────────────────────────────
  const fetchAudio = useCallback(async (text: string, signal: AbortSignal): Promise<string> => {
    const jwt = typeof window !== 'undefined' ? localStorage.getItem('ultimoversio_token') : null;
    const res = await fetch(API_BASE + '/api/deepgram/tts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (jwt ?? '') },
      body:    JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => 'HTTP ' + res.status);
      throw new Error('TTS ' + res.status + ': ' + msg);
    }
    const buf  = await res.arrayBuffer();
    const blob = new Blob([buf], { type: 'audio/mpeg' });
    if (blob.size < 100) throw new Error('Empty audio response from Deepgram');
    return URL.createObjectURL(blob);
  }, []);

  // ─── Play blob with ontimeupdate word-sync ───────────────────────────────────
  const playBlob = useCallback(
    (url: string, chunkStart: number, chunkLen: number): Promise<void> =>
      new Promise((resolve, reject) => {
        if (!isActiveRef.current) { resolve(); return; }

        const audio        = new Audio(url);
        audioRef.current   = audio;

        audio.oncanplaythrough = async () => {
          try {
            if (!isActiveRef.current) { resolve(); return; }
            if (isPausedRef.current) {
              setStatus('paused');
              await waitUntilResumed();
            }
            if (!isActiveRef.current) { resolve(); return; }
            await audio.play();
            setStatus('playing');
          } catch (err) {
            reject(err);
          }
        };

        // Real-time word pointer: maps audio.currentTime → word index
        audio.ontimeupdate = () => {
          if (!isActiveRef.current) return;
          const dur = audio.duration;
          if (!dur || !isFinite(dur)) return;
          const idx = Math.min(
            Math.floor((audio.currentTime / dur) * chunkLen),
            chunkLen - 1,
          );
          onPointerRef.current(chunkStart + idx);
        };

        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          resolve();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          reject(new Error('Audio playback error at chunk starting at token ' + chunkStart));
        };
      }),
    [setStatus, waitUntilResumed],
  );

  const start = useCallback(async (): Promise<void> => {
    isActiveRef.current = false;
    clearAudio();
    isActiveRef.current = true;
    isPausedRef.current = false;

    const toks = tokensRef.current;
    if (toks.length === 0) return;

    setStatus('loading');
    onPointerRef.current(0);

    const chunks = chunkTokens(toks, WORDS_PER_CHUNK);
    const ctrl   = new AbortController();
    abortRef.current = ctrl;

    try {
      let nextChunkUrlPromise: Promise<string> | null = null;

      for (let i = 0; i < chunks.length; i++) {
        if (!isActiveRef.current) break;
        await waitUntilResumed();

        const chunk      = chunks[i];
        const chunkStart = i * WORDS_PER_CHUNK;
        const text       = chunk.map((t) => t.original).join(' ');

        if (!nextChunkUrlPromise) {
          nextChunkUrlPromise = fetchAudio(text, ctrl.signal);
        }

        const url = await nextChunkUrlPromise;
        if (!isActiveRef.current) { URL.revokeObjectURL(url); break; }

        const nextChunk = chunks[i + 1];
        if (nextChunk) {
          const nextText = nextChunk.map((t) => t.original).join(' ');
          nextChunkUrlPromise = fetchAudio(nextText, ctrl.signal);
        } else {
          nextChunkUrlPromise = null;
        }

        if (i > 0 && !isPausedRef.current) setStatus('loading');
        await playBlob(url, chunkStart, chunk.length);
      }
      if (isActiveRef.current) {
        onPointerRef.current(tokensRef.current.length - 1);
        setStatus('done');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'TTS failed';
      console.error('[TTS]', msg);
      onErrorRef.current(msg);
      setStatus('error');
      clearAudio();
    }
  }, [clearAudio, fetchAudio, playBlob, setStatus]);

  const pause = useCallback((): void => {
    if (!isActiveRef.current) return;
    isPausedRef.current = true;
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
    }
    setStatus('paused');
  }, [setStatus]);

  const resume = useCallback((): void => {
    if (!isActiveRef.current) return;
    isPausedRef.current = false;
    resumeWaitersRef.current.forEach((resumeWaiter) => resumeWaiter());
    resumeWaitersRef.current = [];

    const audio = audioRef.current;
    if (audio && audio.paused) {
      audio.play().catch((e: Error) => onErrorRef.current(e.message));
    }
    setStatus('playing');
  }, [setStatus]);

  const stop = useCallback((): void => {
    isActiveRef.current = false;
    clearAudio();
    setStatus('idle');
  }, [clearAudio, setStatus]);

  useEffect(() => () => { isActiveRef.current = false; clearAudio(); }, [clearAudio]);

  return { start, pause, resume, stop };
}
