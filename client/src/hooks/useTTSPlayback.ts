'use client';

import { useRef, useCallback, useEffect } from 'react';
import { Token } from './useScriptTokens';

const WORDS_PER_CHUNK = 160;
const AVG_WPM = 160;

export type TTSStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'done';

export interface UseTTSPlaybackOptions {
  tokens: Token[];
  script: string;
  onPointerChange: (index: number) => void;
  onStatusChange: (status: TTSStatus) => void;
  onError: (msg: string) => void;
  voiceMode?: 'system' | 'ai';
}

export interface UseTTSPlaybackReturn {
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

interface Chunk {
  start: number;
  tokens: Token[];
  text: string;
}

function getTokenStartOffsets(chunk: Chunk): number[] {
  const offsets: number[] = [];
  let cursor = 0;

  for (let i = 0; i < chunk.tokens.length; i += 1) {
    offsets.push(cursor);
    cursor += chunk.tokens[i].original.length;
    if (i < chunk.tokens.length - 1) cursor += 1;
  }

  return offsets;
}

function chunkTokens(tokens: Token[], size: number): Chunk[] {
  const chunks: Chunk[] = [];
  for (let i = 0; i < tokens.length; i += size) {
    const slice = tokens.slice(i, i + size);
    chunks.push({
      start: i,
      tokens: slice,
      text: slice.map((t) => t.original).join(' '),
    });
  }
  return chunks;
}

export function useTTSPlayback({
  tokens,
  onPointerChange,
  onStatusChange,
  onError,
  voiceMode = 'system',
}: UseTTSPlaybackOptions): UseTTSPlaybackReturn {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const queueRef = useRef<Chunk[]>([]);
  const chunkIndexRef = useRef(0);
  const isActiveRef = useRef(false);
  const statusRef = useRef<TTSStatus>('idle');

  const onPointerRef = useRef(onPointerChange);
  const onStatusRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);

  useEffect(() => { onPointerRef.current = onPointerChange; }, [onPointerChange]);
  useEffect(() => { onStatusRef.current = onStatusChange; }, [onStatusChange]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const setStatus = useCallback((status: TTSStatus) => {
    statusRef.current = status;
    onStatusRef.current(status);
  }, []);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    chunkIndexRef.current = 0;
    queueRef.current = [];
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setStatus('idle');
  }, [setStatus]);

  const speakNext = useCallback(() => {
    if (!isActiveRef.current) return;

    const synth = synthRef.current;
    if (!synth) {
      onErrorRef.current('Speech synthesis is not available in this browser.');
      setStatus('error');
      return;
    }

    const chunks = queueRef.current;
    const idx = chunkIndexRef.current;

    if (idx >= chunks.length) {
      setStatus('done');
      isActiveRef.current = false;
      return;
    }

    const chunk = chunks[idx];
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    const tokenStartOffsets = getTokenStartOffsets(chunk);
    const wordDuration = 60 / AVG_WPM;
    utterance.rate = Math.max(0.8, Math.min(1.4, 0.45 / wordDuration));
    utterance.pitch = 1;

    utterance.onstart = () => {
      setStatus('playing');
      onPointerRef.current(chunk.start);
    };

    utterance.onboundary = (event) => {
      if ((event as SpeechSynthesisEvent).name && (event as SpeechSynthesisEvent).name !== 'word') return;
      if (!chunk.tokens.length) return;
      const charIndex = event.charIndex || 0;
      let offset = 0;
      for (let i = 1; i < tokenStartOffsets.length; i += 1) {
        if (charIndex >= tokenStartOffsets[i]) {
          offset = i;
        } else {
          break;
        }
      }
      onPointerRef.current(chunk.start + offset);
    };

    utterance.onerror = () => {
      setStatus('error');
      onErrorRef.current('System voice playback failed.');
      isActiveRef.current = false;
    };

    utterance.onend = () => {
      onPointerRef.current(chunk.start + Math.max(0, chunk.tokens.length - 1));
      chunkIndexRef.current += 1;
      speakNext();
    };

    synth.speak(utterance);
  }, [setStatus]);

  const start = useCallback(async (): Promise<void> => {
    if (voiceMode === 'ai') {
      onErrorRef.current('AI Voice is coming soon. Using System Voice for now.');
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onErrorRef.current('Speech synthesis is not supported in this browser.');
      setStatus('error');
      return;
    }

    if (!tokens.length) {
      onErrorRef.current('No script tokens available to read.');
      setStatus('error');
      return;
    }

    synthRef.current = window.speechSynthesis;
    synthRef.current.cancel();

    queueRef.current = chunkTokens(tokens, WORDS_PER_CHUNK);
    chunkIndexRef.current = 0;
    isActiveRef.current = true;

    setStatus('loading');
    speakNext();
  }, [setStatus, speakNext, tokens, voiceMode]);

  const pause = useCallback(() => {
    if (!synthRef.current || !isActiveRef.current) return;
    synthRef.current.pause();
    setStatus('paused');
  }, [setStatus]);

  const resume = useCallback(() => {
    if (!synthRef.current || !isActiveRef.current) return;
    synthRef.current.resume();
    setStatus('playing');
  }, [setStatus]);

  useEffect(() => () => stop(), [stop]);

  return { start, pause, resume, stop };
}
