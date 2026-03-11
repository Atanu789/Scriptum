'use client';

/**
 * TeleprompterEngine — three mutually-exclusive modes
 * ────────────────────────────────────────────────────
 *  🔊 TTS Mode    — Deepgram Draco reads aloud; words highlight in real time
 *  🎤 Mic Mode    — User speaks; Deepgram STT matches words in real time
 *  📜 Manual Mode — Auto-scroll at controlled speed, no audio
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  memo,
} from 'react';
import {
  Mic, MicOff, Play, Pause, RotateCcw,
  SlidersHorizontal, ChevronDown, ChevronUp,
  AlertCircle, Loader2, Volume2, VolumeX, Headphones,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScriptTokens, Token }          from '@/hooks/useScriptTokens';
import { useWordMatcher }                   from '@/hooks/useWordMatcher';
import { useDeepgramSync, SyncStatus }      from '@/hooks/useDeepgramSync';
import { useAutoScroll }                    from '@/hooks/useAutoScroll';
import { useTTSPlayback, TTSStatus }        from '@/hooks/useTTSPlayback';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeleprompterEngineProps {
  script: string;
  documentTitle?: string;
}

type ActiveMode = 'tts' | 'mic' | 'manual' | 'idle';

// ─── Script Renderer — MEMOISED ───────────────────────────────────────────────
// Highlighting is applied via direct DOM class mutation — never re-renders on
// pointer changes, keeping scroll smooth.

interface ScriptRendererProps {
  tokens:       Token[];
  containerRef: React.RefObject<HTMLDivElement>;
  fontSize:     number;
}

const ScriptRenderer = memo(function ScriptRenderer({
  tokens,
  containerRef,
  fontSize,
}: ScriptRendererProps) {
  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto px-6 py-14 leading-[1.9] focus:outline-none"
      style={{ fontSize: `${fontSize}px` }}
      tabIndex={-1}
    >
      <p className="mx-auto max-w-3xl select-none" aria-live="off">
        {tokens.map((token) => (
          <span
            key={token.index}
            data-token-index={token.index}
            className="tp-token mr-[0.28em] inline-block"
          >
            {token.original}
          </span>
        ))}
      </p>
    </div>
  );
});

// ─── Controls ─────────────────────────────────────────────────────────────────

interface ControlsProps {
  activeMode:      ActiveMode;
  ttsStatus:       TTSStatus;
  syncStatus:      SyncStatus;
  isManualPlaying: boolean;
  speed:           number;
  fontSize:        number;
  onStartTTS:      () => void;
  onPauseTTS:      () => void;
  onResumeTTS:     () => void;
  onStopTTS:       () => void;
  onStartMic:      () => void;
  onStopMic:       () => void;
  onToggleManual:  () => void;
  onReset:         () => void;
  onSpeedChange:   (v: number) => void;
  onFontSizeChange:(v: number) => void;
}

function Controls({
  activeMode, ttsStatus, syncStatus, isManualPlaying,
  speed, fontSize,
  onStartTTS, onPauseTTS, onResumeTTS, onStopTTS,
  onStartMic, onStopMic, onToggleManual, onReset,
  onSpeedChange, onFontSizeChange,
}: ControlsProps) {

  const isTTSLoading = ttsStatus === 'loading';
  const isTTSPlaying = ttsStatus === 'playing';
  const isTTSPaused  = ttsStatus === 'paused';
  const isTTSDone    = ttsStatus === 'done';
  const isMicLive    = syncStatus === 'listening';
  const isMicConn    = syncStatus === 'connecting';

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#0d0d18]/95 px-4 py-3 backdrop-blur-md">

      {/* ── TTS Read Aloud ─────────────────────────────────────── */}
      {activeMode !== 'tts' && (
        <button
          onClick={onStartTTS}
          disabled={activeMode === 'mic'}
          title={activeMode === 'mic' ? 'Stop mic first' : 'Read aloud with Draco voice'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all active:scale-[0.97]',
            activeMode === 'mic'
              ? 'cursor-not-allowed bg-white/[0.03] text-white/20'
              : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500',
          )}
        >
          {isTTSLoading
            ? <Loader2    className="h-3.5 w-3.5 animate-spin" />
            : <Headphones className="h-3.5 w-3.5" />}
          {isTTSLoading ? 'Loading…' : isTTSDone ? 'Replay' : 'Read Aloud'}
        </button>
      )}

      {activeMode === 'tts' && (
        <div className="flex items-center gap-1.5">
          {isTTSLoading && (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3.5 py-2 text-sm text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching audio…
            </div>
          )}
          {isTTSPlaying && (
            <button onClick={onPauseTTS}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.08] px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/[0.13] transition-all active:scale-[0.97]">
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          )}
          {isTTSPaused && (
            <button onClick={onResumeTTS}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-all active:scale-[0.97]">
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
          )}
          <button onClick={onStopTTS}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-medium text-white/50 hover:bg-red-500/15 hover:text-red-400 transition-all active:scale-[0.97]">
            <VolumeX className="h-3.5 w-3.5" /> Stop
          </button>
          {isTTSPlaying && (
            <div className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 ring-1 ring-indigo-500/25">
              <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
              <span className="text-[11px] font-semibold text-indigo-400">Reading</span>
            </div>
          )}
          {isTTSPaused && (
            <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/30">Paused</span>
          )}
        </div>
      )}

      <div className="h-5 w-px bg-white/20" />

      {/* ── Mic Sync ────────────────────────────────────────────── */}
      {!isMicLive && !isMicConn && activeMode !== 'tts' && (
        <button
          onClick={onStartMic}
          disabled={activeMode === 'manual'}
          title={activeMode === 'manual' ? 'Stop manual first' : 'Sync with your voice'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all active:scale-[0.97]',
            activeMode === 'manual'
              ? 'cursor-not-allowed text-white/30'
              : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.13] hover:text-white',

          )}
        >
          <Mic className="h-3.5 w-3.5" /> Mic Sync
        </button>
      )}

      {(isMicLive || isMicConn) && (
        <button onClick={onStopMic}
          className="inline-flex items-center gap-1.5 rounded-xl bg-red-600/80 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 transition-all active:scale-[0.97]">
          {isMicConn
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <MicOff  className="h-3.5 w-3.5" />}
          {isMicConn ? 'Connecting…' : 'Stop Mic'}
        </button>
      )}

      {isMicLive && (
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 ring-1 ring-emerald-500/25">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-[11px] font-semibold text-emerald-400">Live</span>
        </div>
      )}

      <div className="h-5 w-px bg-white/20" />

      {/* ── Manual Scroll ───────────────────────────────────────── */}
      <button
        onClick={onToggleManual}
        disabled={activeMode === 'tts' || activeMode === 'mic'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all active:scale-[0.97]',
          activeMode === 'manual'
            ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 hover:bg-amber-500/20'
            : (activeMode === 'tts' || activeMode === 'mic')
            ? 'cursor-not-allowed text-white/25'
            : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.13] hover:text-white',
        )}
      >
        {activeMode === 'manual' && isManualPlaying
          ? <><Pause   className="h-3.5 w-3.5" /> Pause</>
          : activeMode === 'manual'
          ? <><Play    className="h-3.5 w-3.5" /> Resume</>
          : <><Volume2 className="h-3.5 w-3.5" /> Manual</>}
      </button>

      <div className="h-5 w-px bg-white/20" />

      {/* ── Speed (manual only) ─────────────────────────────────── */}
      {activeMode === 'manual' && (
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3 w-3 flex-shrink-0 text-white/50" />
          <input type="range" min={1} max={10} step={0.5} value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/20 accent-amber-400" />
          <span className="w-5 text-right text-[11px] text-white/70 tabular-nums">{speed}×</span>
        </div>
      )}

      {/* ── Font size ───────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        <button onClick={() => onFontSizeChange(Math.max(18, fontSize - 4))}
          className="rounded-lg px-2 py-1.5 text-white/50 hover:bg-white/[0.08] hover:text-white/80 transition-colors">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <span className="w-10 text-center text-[11px] text-white/70 tabular-nums">{fontSize}px</span>
        <button onClick={() => onFontSizeChange(Math.min(72, fontSize + 4))}
          className="rounded-lg px-2 py-1.5 text-white/50 hover:bg-white/[0.08] hover:text-white/80 transition-colors">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Reset ──────────────────────────────────────────────── */}
      <div className="ml-auto">
        <button onClick={onReset} title="Reset to beginning"
          className="rounded-xl p-2 text-white/50 hover:bg-white/[0.08] hover:text-white/80 transition-all active:scale-[0.97]">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export default function TeleprompterEngine({ script, documentTitle }: TeleprompterEngineProps) {

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeMode,      setActiveMode]      = useState<ActiveMode>('idle');
  const [ttsStatus,       setTTSStatus]       = useState<TTSStatus>('idle');
  const [syncStatus,      setSyncStatus]      = useState<SyncStatus>('idle');
  const [isManualPlaying, setIsManualPlaying] = useState(false);
  const [errorMsg,        setErrorMsg]        = useState<string | null>(null);
  const [speed,           setSpeed]           = useState(3);
  const [fontSize,        setFontSize]        = useState(32);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const containerRef       = useRef<HTMLDivElement>(null);
  const lastHighlightedRef = useRef<number>(-1);
  const rafManualRef       = useRef<number>(0);
  const speedRef           = useRef(speed);
  const isManualPlayingRef = useRef(isManualPlaying);
  const activeModeRef      = useRef(activeMode);

  useEffect(() => { speedRef.current         = speed; },        [speed]);
  useEffect(() => { isManualPlayingRef.current = isManualPlaying; }, [isManualPlaying]);
  useEffect(() => { activeModeRef.current     = activeMode; },  [activeMode]);

  // ── Tokenise ───────────────────────────────────────────────────────────────
  const tokens = useScriptTokens(script);

  // ── Word matcher (mic mode) ────────────────────────────────────────────────
  const { processChunk, reset: resetMatcher } = useWordMatcher(tokens);

  // ── Auto scroll ────────────────────────────────────────────────────────────
  const { scrollToToken } = useAutoScroll(containerRef);

  // ── Token highlight — direct DOM, no re-render ────────────────────────────
  const applyHighlight = useCallback((newPointer: number) => {
    const container = containerRef.current;
    if (!container) return;
    const prev = lastHighlightedRef.current;
    if (prev >= 0) {
      container.querySelector<HTMLElement>(`[data-token-index="${prev}"]`)
        ?.classList.remove('tp-active');
    }
    for (let i = Math.max(0, prev); i < newPointer; i++) {
      const el = container.querySelector<HTMLElement>(`[data-token-index="${i}"]`);
      if (el) { el.classList.add('tp-spoken'); el.classList.remove('tp-active'); }
    }
    container.querySelector<HTMLElement>(`[data-token-index="${newPointer}"]`)
      ?.classList.add('tp-active');
    lastHighlightedRef.current = newPointer;
  }, []);

  const advancePointer = useCallback((pointer: number) => {
    applyHighlight(pointer);
    scrollToToken(pointer);
  }, [applyHighlight, scrollToToken]);

  // ── Full DOM reset helper ──────────────────────────────────────────────────
  const resetDOM = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = 0;
    containerRef.current.querySelectorAll<HTMLElement>('.tp-token').forEach((el) => {
      el.classList.remove('tp-spoken', 'tp-active');
    });
    lastHighlightedRef.current = -1;
  }, []);

  // ── TTS playback ───────────────────────────────────────────────────────────
  const { start: ttsStart, pause: ttsPause, resume: ttsResume, stop: ttsStop } = useTTSPlayback({
    tokens,
    script,
    onPointerChange: advancePointer,
    onStatusChange: (s) => {
      setTTSStatus(s);
      if (s === 'done' || s === 'error' || s === 'idle') setActiveMode('idle');
    },
    onError: (msg) => { setErrorMsg(msg); setActiveMode('idle'); },
  });

  // ── Deepgram STT mic ───────────────────────────────────────────────────────
  const { start: micStart, stop: micStop } = useDeepgramSync({
    onTranscript: (text) => { advancePointer(processChunk(text)); },
    onStatusChange: setSyncStatus,
    onError: (msg) => { setErrorMsg(msg); setActiveMode('idle'); },
  });

  // ── Manual scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeMode !== 'manual' || !isManualPlaying) {
      cancelAnimationFrame(rafManualRef.current);
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const tick = () => {
      if (!isManualPlayingRef.current || activeModeRef.current !== 'manual') return;
      container.scrollTop += speedRef.current * 0.7;
      rafManualRef.current = requestAnimationFrame(tick);
    };
    rafManualRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafManualRef.current);
  }, [activeMode, isManualPlaying]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleStartTTS = useCallback(() => {
    setErrorMsg(null);
    micStop();
    cancelAnimationFrame(rafManualRef.current);
    setIsManualPlaying(false);
    resetDOM();
    resetMatcher();
    setActiveMode('tts');
    ttsStart();
  }, [micStop, resetDOM, resetMatcher, ttsStart]);

  const handlePauseTTS  = useCallback(() => ttsPause(),  [ttsPause]);
  const handleResumeTTS = useCallback(() => ttsResume(), [ttsResume]);
  const handleStopTTS   = useCallback(() => {
    ttsStop();
    setActiveMode('idle');
    setTTSStatus('idle');
  }, [ttsStop]);

  const handleStartMic = useCallback(() => {
    setErrorMsg(null);
    ttsStop();
    cancelAnimationFrame(rafManualRef.current);
    setIsManualPlaying(false);
    resetMatcher();
    setActiveMode('mic');
    micStart();
  }, [micStart, resetMatcher, ttsStop]);

  const handleStopMic = useCallback(() => {
    micStop();
    setActiveMode('idle');
  }, [micStop]);

  const handleToggleManual = useCallback(() => {
    if (activeMode !== 'manual') {
      ttsStop();
      micStop();
      setActiveMode('manual');
      setIsManualPlaying(true);
    } else {
      setIsManualPlaying((v) => !v);
    }
  }, [activeMode, micStop, ttsStop]);

  const handleReset = useCallback(() => {
    ttsStop();
    micStop();
    cancelAnimationFrame(rafManualRef.current);
    resetMatcher();
    setActiveMode('idle');
    setTTSStatus('idle');
    setSyncStatus('idle');
    setIsManualPlaying(false);
    setErrorMsg(null);
    resetDOM();
  }, [micStop, resetDOM, resetMatcher, ttsStop]);

  // ── Unmount ────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    ttsStop();
    micStop();
    cancelAnimationFrame(rafManualRef.current);
  }, [micStop, ttsStop]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-[#07070f] text-white">

      {/* Title bar */}
      {documentTitle && (
        <div className="flex items-center gap-2 border-b border-white/[0.04] px-5 py-2">
          <span className="truncate text-xs text-white/25">{documentTitle}</span>
          <span className="ml-auto rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-indigo-400 ring-1 ring-indigo-500/20">
            Teleprompter
          </span>
        </div>
      )}

      {/* Error banner */}
      {errorMsg && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-5 py-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
          <span className="flex-1 text-xs text-red-400">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-400/50 hover:text-red-300">×</button>
        </div>
      )}

      {/* Script */}
      <div className="flex-1 overflow-hidden">
        {tokens.length === 0
          ? <div className="flex h-full items-center justify-center"><p className="text-sm text-white/20">No script loaded.</p></div>
          : <ScriptRenderer tokens={tokens} containerRef={containerRef} fontSize={fontSize} />}
      </div>

      {/* Controls */}
      <Controls
        activeMode={activeMode}
        ttsStatus={ttsStatus}
        syncStatus={syncStatus}
        isManualPlaying={isManualPlaying}
        speed={speed}
        fontSize={fontSize}
        onStartTTS={handleStartTTS}
        onPauseTTS={handlePauseTTS}
        onResumeTTS={handleResumeTTS}
        onStopTTS={handleStopTTS}
        onStartMic={handleStartMic}
        onStopMic={handleStopMic}
        onToggleManual={handleToggleManual}
        onReset={handleReset}
        onSpeedChange={setSpeed}
        onFontSizeChange={setFontSize}
      />
    </div>
  );
}
