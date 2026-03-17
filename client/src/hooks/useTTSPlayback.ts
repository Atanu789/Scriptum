'use client';

import { useRef, useCallback, useEffect } from 'react';
import { Token } from './useScriptTokens';

const WORDS_PER_CHUNK = 150;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

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

  const primeAudioOutput = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined') return;

    try {
      const unlockAudio = new Audio(SILENT_WAV_DATA_URI);
      unlockAudio.preload = 'auto';
      unlockAudio.muted = true;
      await unlockAudio.play();
      unlockAudio.pause();
      unlockAudio.currentTime = 0;
      unlockAudio.src = '';
    } catch {
      // Best-effort unlock only. If this fails, regular playback path still runs.
    }
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

        const audio        = new Audio();
        audio.preload      = 'auto';
        audio.volume       = 1;
        audio.muted        = false;
        audio.src          = url;
        audioRef.current   = audio;
        let hasStarted = false;
        let loadTimeout: ReturnType<typeof setTimeout> | null = null;

        const finalize = (err?: Error) => {
          if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
          }
          audio.oncanplay = null;
          audio.oncanplaythrough = null;
          audio.onloadeddata = null;
          if (err) {
            reject(err);
          }
        };

        const tryStartPlayback = async () => {
          if (hasStarted || !isActiveRef.current) return;
          hasStarted = true;
          try {
            if (isPausedRef.current) {
              setStatus('paused');
              await waitUntilResumed();
            }
            if (!isActiveRef.current) { resolve(); return; }

            try {
              await audio.play();
            } catch (err) {
              const message = err instanceof Error ? err.message.toLowerCase() : '';
              // Safari/Chrome can throw NotAllowedError after async fetch despite user click.
              if (message.includes('notallowed') || message.includes('interact')) {
                audio.muted = true;
                await audio.play();
                audio.muted = false;
              } else {
                throw err;
              }
            }

            setStatus('playing');
          } catch (err) {
            hasStarted = false;
            finalize(err as Error);
          }
        };

        audio.oncanplay = async () => {
          await tryStartPlayback();
        };
        audio.oncanplaythrough = async () => { await tryStartPlayback(); };
        audio.onloadeddata = async () => { await tryStartPlayback(); };

        loadTimeout = setTimeout(() => {
          if (!hasStarted && isActiveRef.current) {
            finalize(new Error('Audio took too long to become playable.'));
          }
        }, 15000);

        if (audio.readyState >= 2) {
          void tryStartPlayback();
        }

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
          finalize();
          URL.revokeObjectURL(url);
          audioRef.current = null;
          resolve();
        };

        audio.onerror = () => {
          finalize();
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

    await primeAudioOutput();

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
          setStatus('loading');
          nextChunkUrlPromise = fetchAudio(text, ctrl.signal);
        }

        setStatus('loading');
        const url = await nextChunkUrlPromise;
        if (!isActiveRef.current) { URL.revokeObjectURL(url); break; }

        const nextChunk = chunks[i + 1];
        if (nextChunk) {
          const nextText = nextChunk.map((t) => t.original).join(' ');
          nextChunkUrlPromise = fetchAudio(nextText, ctrl.signal);
        } else {
          nextChunkUrlPromise = null;
        }

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
  }, [clearAudio, fetchAudio, playBlob, primeAudioOutput, setStatus]);

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
