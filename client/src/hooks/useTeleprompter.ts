'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

export interface TeleprompterControls {
  isPlaying: boolean;
  speed: number;
  fontSize: number;
  theme: 'dark' | 'light';
  mirror: boolean;
  progress: number;
  currentCharIndex: number;
  isSpeaking: boolean;
  isSyncMode: boolean;
  isListening: boolean;
  toggleSyncMode: () => void;
  scrollRef: React.MutableRefObject<HTMLDivElement | null>;
  toggle: () => void;
  reset: () => void;
  setSpeed: (v: number) => void;
  setFontSize: (v: number) => void;
  setTheme: (t: 'dark' | 'light') => void;
  toggleMirror: () => void;
}

interface TeleprompterOptions {
  allowSyncMode?: boolean;
  onSyncModeBlocked?: () => void;
}

export function useTeleprompter(text: string, options?: TeleprompterOptions): TeleprompterControls {
  const allowSyncMode = options?.allowSyncMode ?? true;
  const onSyncModeBlocked = options?.onSyncModeBlocked;

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(5);
  const [fontSize, setFontSizeState] = useState(32);
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const [mirror, setMirror] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(-1);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [isSyncMode, setIsSyncMode] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const speedRef = useRef(speed);
  const allowSyncRef = useRef(allowSyncMode);
  const onSyncModeBlockedRef = useRef(onSyncModeBlocked);
  const pausedAtCharRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const isSyncModeRef = useRef(false);
  const scriptWordsRef = useRef<Array<{ clean: string; charStart: number }>>([]);
  const recogPtrRef = useRef(0);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    allowSyncRef.current = allowSyncMode;
  }, [allowSyncMode]);

  useEffect(() => {
    onSyncModeBlockedRef.current = onSyncModeBlocked;
  }, [onSyncModeBlocked]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    if (!isSpeaking) lastTimeRef.current = 0;
  }, [isSpeaking]);

  useEffect(() => {
    isSyncModeRef.current = isSyncMode;
  }, [isSyncMode]);

  useEffect(() => {
    const words: Array<{ clean: string; charStart: number }> = [];
    const re = /(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      words.push({
        clean: m[0].toLowerCase().replace(/[^a-z']/g, ''),
        charStart: m.index,
      });
    }
    scriptWordsRef.current = words;
    recogPtrRef.current = 0;
  }, [text]);

  const startSpeech = useCallback((fromChar: number) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const slice = text.slice(fromChar).trimStart();
    if (!slice) return;

    const trimOffset = text.slice(fromChar).length - slice.length;
    const base = fromChar + trimOffset;

    const utterance = new SpeechSynthesisUtterance(slice);
    utterance.rate = 0.92;
    utterance.lang = 'en-US';

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name === 'word') {
        const abs = base + e.charIndex;
        pausedAtCharRef.current = abs;
        setCurrentCharIndex(abs);
      }
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentCharIndex(-1);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setCurrentCharIndex(-1);
    };

    window.speechSynthesis.speak(utterance);
  }, [text]);

  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setCurrentCharIndex(-1);
  }, []);

  const startRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      console.warn('Web SpeechRecognition not supported in this browser.');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }

    const charPos = pausedAtCharRef.current;
    const script = scriptWordsRef.current;
    let startIdx = 0;
    for (let i = 0; i < script.length; i++) {
      if (script[i].charStart <= charPos) startIdx = i;
      else break;
    }
    recogPtrRef.current = startIdx;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    recognitionRef.current = rec;

    rec.onstart = () => setIsListening(true);
    rec.onend = () => {
      setIsListening(false);
      if (isSyncModeRef.current && isPlayingRef.current) {
        try {
          rec.start();
        } catch {
          // already started
        }
      }
    };

    rec.onresult = (event: any) => {
      const scr = scriptWordsRef.current;
      for (let ri = event.resultIndex; ri < event.results.length; ri++) {
        const result = event.results[ri];
        const transcript = result[0].transcript as string;
        const spoken = transcript
          .trim()
          .toLowerCase()
          .split(/\s+/)
          .map((w: string) => w.replace(/[^a-z']/g, ''))
          .filter(Boolean);

        if (result.isFinal) {
          for (const word of spoken) {
            const ptr = recogPtrRef.current;
            for (let i = ptr; i < Math.min(ptr + 20, scr.length); i++) {
              if (scr[i].clean === word || (word.length >= 3 && scr[i].clean.startsWith(word.slice(0, 3)))) {
                recogPtrRef.current = i + 1;
                pausedAtCharRef.current = scr[i].charStart;
                setCurrentCharIndex(scr[i].charStart);
                break;
              }
            }
          }
        } else {
          const last = spoken[spoken.length - 1];
          if (!last || last.length < 2) continue;
          const ptr = recogPtrRef.current;
          for (let i = ptr; i < Math.min(ptr + 12, scr.length); i++) {
            if (scr[i].clean.startsWith(last)) {
              setCurrentCharIndex(scr[i].charStart);
              break;
            }
          }
        }
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.error('SpeechRecognition error:', event.error);
    };

    rec.start();
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      if (isSyncModeRef.current) {
        startRecognition();
      } else {
        startSpeech(pausedAtCharRef.current);
      }
    } else {
      stopSpeech();
      stopRecognition();
    }
  }, [isPlaying, startRecognition, startSpeech, stopRecognition, stopSpeech]);

  useEffect(() => {
    if (!isPlaying || typeof window === 'undefined') return;
    const id = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
    return () => clearInterval(id);
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const tick = useCallback((timestamp: number) => {
    if (!isPlayingRef.current || !scrollRef.current) return;

    const el = scrollRef.current;
    const maxScroll = el.scrollHeight - el.clientHeight;

    if (isSpeakingRef.current || isSyncModeRef.current) {
      if (maxScroll > 0) setProgress(Math.round((el.scrollTop / maxScroll) * 100));
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
    const delta = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    if (maxScroll <= 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const px = speedRef.current * 0.03 * delta;

    if (el.scrollTop >= maxScroll - 1) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setProgress(100);
      return;
    }

    el.scrollTop = Math.min(el.scrollTop + px, maxScroll);
    setProgress(Math.round((el.scrollTop / maxScroll) * 100));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, tick]);

  const toggle = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = 0;
    pausedAtCharRef.current = 0;
    recogPtrRef.current = 0;
    stopRecognition();
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setProgress(0);
    setCurrentCharIndex(-1);
  }, [stopRecognition]);

  const toggleSyncMode = useCallback(() => {
    if (!allowSyncRef.current) {
      onSyncModeBlockedRef.current?.();
      return;
    }

    setIsSyncMode((prev) => {
      const next = !prev;
      isSyncModeRef.current = next;
      if (isPlayingRef.current) {
        if (next) {
          stopSpeech();
          startRecognition();
        } else {
          stopRecognition();
          startSpeech(pausedAtCharRef.current);
        }
      }
      return next;
    });
  }, [startRecognition, startSpeech, stopRecognition, stopSpeech]);

  const setSpeed = useCallback((v: number) => setSpeedState(Math.max(1, Math.min(20, v))), []);
  const setFontSize = useCallback((v: number) => setFontSizeState(Math.max(16, Math.min(72, v))), []);
  const setTheme = useCallback((t: 'dark' | 'light') => setThemeState(t), []);
  const toggleMirror = useCallback(() => setMirror((m) => !m), []);

  return {
    isPlaying,
    speed,
    fontSize,
    theme,
    mirror,
    progress,
    currentCharIndex,
    isSpeaking,
    isSyncMode,
    isListening,
    toggleSyncMode,
    scrollRef,
    toggle,
    reset,
    setSpeed,
    setFontSize,
    setTheme,
    toggleMirror,
  };
}
