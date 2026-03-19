'use client';

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useTeleprompter } from '@/hooks/useTeleprompter';
import { cn } from '@/lib/utils';
import {
  Play, Pause, RotateCcw, ChevronLeft,
  Sun, Moon, Minus, Plus, Gauge, FlipHorizontal, Mic,
} from 'lucide-react';

// ── Small animated waveform shown while narrating ──────────────────────────
function SpeakingWave({ dark }: { dark: boolean }) {
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden>
      {[3, 6, 4, 8, 5].map((h, i) => (
        <span
          key={i}
          className={cn('w-[3px] rounded-full', dark ? 'bg-yellow-400' : 'bg-amber-500')}
          style={{
            height: `${h}px`,
            animation: `wavebar 0.9s ease-in-out ${i * 0.12}s infinite alternate`,
          }}
        />
      ))}
    </span>
  );
}

interface Props {
  text: string;
  documentTitle: string;
  documentId: string;
}

// ── Tokeniser ──────────────────────────────────────────────────────────────
// Note: Uses RegExp.exec() for safe text tokenization (not system command execution)
interface Token {
  text: string;
  start: number;
  isWord: boolean;
}

function tokenise(raw: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\S+|\s+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    tokens.push({ text: m[0], start: m.index, isWord: /\S/.test(m[0]) });
  }
  return tokens;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function TeleprompterView({ text, documentTitle, documentId }: Props) {
  const {
    isPlaying, speed, fontSize, theme, mirror, progress,
    currentCharIndex, isSpeaking,
    isSyncMode, isListening, toggleSyncMode,
    scrollRef, toggle, reset, setSpeed, setFontSize, setTheme, toggleMirror,
  } = useTeleprompter(text);

  const isDark = theme === 'dark';

  // Per-word DOM refs for speech-driven scroll
  const wordRefsMap = useRef<Map<number, HTMLSpanElement>>(new Map());

  // Word count / reading estimate
  const wordCount        = useMemo(() => text.trim().split(/\s+/).filter(Boolean).length, [text]);
  const estimatedMinutes = wordCount > 0 ? Math.ceil(wordCount / 130) : 0;

  // Tokenise once
  const tokens = useMemo(() => tokenise(text), [text]);

  // ── Speech-driven scroll ─────────────────────────────────────────────────
  // When the speech boundary fires, scroll the active word to the reading
  // line (45 % from top of the container).
  useEffect(() => {
    if (currentCharIndex < 0 || !isSpeaking || !scrollRef.current) return;

    let activeIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.isWord && currentCharIndex >= t.start && currentCharIndex < t.start + t.text.length) {
        activeIdx = i;
        break;
      }
    }
    if (activeIdx < 0) return;

    const wordEl    = wordRefsMap.current.get(activeIdx);
    const container = scrollRef.current;
    if (!wordEl || !container) return;

    const containerRect = container.getBoundingClientRect();
    const wordRect      = wordEl.getBoundingClientRect();
    const targetTop     =
      container.scrollTop +
      (wordRect.top - containerRect.top) -
      containerRect.height * 0.45;

    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharIndex, isSpeaking]);

  // â”€â”€ Keyboard shortcuts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          toggle();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          reset();
          break;
        case 'v':
        case 'V':
          e.preventDefault();
          toggleSyncMode();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSpeed(speed + 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSpeed(speed - 1);
          break;
        case '+':
        case '=':
          setFontSize(fontSize + 2);
          break;
        case '-':
          setFontSize(fontSize - 2);
          break;
        case 'm':
        case 'M':
          toggleMirror();
          break;
      }
    },
    [toggle, reset, setSpeed, setFontSize, toggleMirror, toggleSyncMode, speed, fontSize]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Keyframe animations */}
      <style>{`
        @keyframes wavebar {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.0); }
        }
        @keyframes livepulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
      `}</style>

      <div
        className={cn(
          'relative flex h-screen flex-col overflow-hidden select-none',
          isDark ? 'bg-[#0d0d0f] text-white' : 'bg-[#fafaf8] text-gray-900',
        )}
      >
        {/* ── Top fade ──────────────────────────────────────────────────── */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-20 h-36',
            isDark
              ? 'bg-gradient-to-b from-[#0d0d0f] via-[#0d0d0f]/80 to-transparent'
              : 'bg-gradient-to-b from-[#fafaf8] via-[#fafaf8]/80 to-transparent',
          )}
        />

        {/* ── LIVE / Narrating badges + doc info (top overlay) ─────────── */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-5 pt-4">
          <div className="flex items-center gap-2">
            {isPlaying && (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest',
                  isDark
                    ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
                    : 'bg-red-50 text-red-600 ring-1 ring-red-300',
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-current"
                  style={{ animation: 'livepulse 1.2s ease-in-out infinite' }}
                />
                Live
              </span>
            )}
            {isSpeaking && (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  isDark
                    ? 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20'
                    : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
                )}
              >
                <SpeakingWave dark={isDark} />
                <span>Narrating</span>
              </span>
            )}
            {isListening && (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  isDark
                    ? 'bg-indigo-500/12 text-indigo-300 ring-1 ring-indigo-500/25'
                    : 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200',
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-current"
                  style={{ animation: 'livepulse 1s ease-in-out infinite' }}
                />
                Listening
              </span>
            )}
          </div>

          <div className="text-right">
            <p
              className={cn(
                'max-w-[140px] truncate text-xs font-medium sm:max-w-[220px]',
                isDark ? 'text-white/40' : 'text-gray-400',
              )}
            >
              {documentTitle}
            </p>
            <p className={cn('text-[10px]', isDark ? 'text-white/20' : 'text-gray-300')}>
              {wordCount.toLocaleString()} words · ~{estimatedMinutes} min
            </p>
          </div>
        </div>

        {/* ── Reading line at 45 % ──────────────────────────────────────── */}
        <div
          className="pointer-events-none absolute inset-x-0 z-10"
          style={{ top: '45%', transform: 'translateY(-50%)' }}
        >
          <div className="flex items-center">
            <div className={cn('h-px flex-1', isDark ? 'bg-white/[0.05]' : 'bg-gray-200/60')} />
            <div
              className={cn(
                'mx-4 h-[2px] w-12 rounded-full',
                isDark ? 'bg-yellow-400/40' : 'bg-amber-500/30',
              )}
            />
            <div className={cn('h-px flex-1', isDark ? 'bg-white/[0.05]' : 'bg-gray-200/60')} />
          </div>
        </div>

        {/* ── Scrolling text ────────────────────────────────────────────── */}
        <div
          ref={scrollRef as React.RefObject<HTMLDivElement>}
          className="flex-1 overflow-y-scroll"
          style={{ scrollBehavior: 'auto' }}
        >
          <div
            className="mx-auto max-w-3xl px-6 lg:px-10"
            style={{
              paddingTop: '45vh',
              paddingBottom: '55vh',
              transform: mirror ? 'scaleX(-1)' : undefined,
            }}
          >
            <p
              className="text-center leading-relaxed tracking-wide"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.9 }}
            >
              {tokens.map((token, i) => {
                if (!token.isWord) {
                  if (token.text.includes('\n')) {
                    return token.text
                      .split('\n')
                      .map((_, ni) => (ni === 0 ? null : <br key={`${i}-${ni}`} />));
                  }
                  return <span key={i}>{token.text}</span>;
                }

                const isActive =
                  currentCharIndex >= 0 &&
                  currentCharIndex >= token.start &&
                  currentCharIndex < token.start + token.text.length;

                const isPast =
                  currentCharIndex >= 0 &&
                  token.start + token.text.length < currentCharIndex;

                return (
                  <span
                    key={i}
                    ref={(el) => {
                      if (el) wordRefsMap.current.set(i, el);
                      else wordRefsMap.current.delete(i);
                    }}
                    style={
                      isActive
                        ? {
                            backgroundColor: isDark
                              ? 'rgba(250, 204, 21, 0.18)'
                              : 'rgba(245, 158, 11, 0.16)',
                            color: isDark ? '#fde047' : '#b45309',
                            borderRadius: '6px',
                            padding: '0 3px',
                            boxShadow: isDark
                              ? '0 0 18px rgba(250, 204, 21, 0.28)'
                              : '0 0 10px rgba(245, 158, 11, 0.15)',
                            textShadow: isDark ? '0 0 24px rgba(250, 204, 21, 0.45)' : 'none',
                            transition: 'all 0.08s ease',
                          }
                        : isPast
                          ? { opacity: isDark ? 0.38 : 0.4, transition: 'opacity 0.15s ease' }
                          : undefined
                    }
                  >
                    {token.text}
                  </span>
                );
              })}
            </p>
          </div>
        </div>

        {/* ── Bottom fade ───────────────────────────────────────────────── */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 z-20',
            isDark
              ? 'bg-gradient-to-t from-[#0d0d0f] via-[#0d0d0f]/70 to-transparent'
              : 'bg-gradient-to-t from-[#fafaf8] via-[#fafaf8]/70 to-transparent',
          )}
          style={{ bottom: '80px', height: '130px' }}
        />

        {/* ── Controls bar ──────────────────────────────────────────────── */}
        <div
          className={cn(
            'relative z-30 flex shrink-0 items-center justify-between gap-2 border-t px-2 py-2 sm:px-4 sm:py-3',
            isDark
              ? 'border-white/[0.07] bg-[#111113]/90 backdrop-blur-xl'
              : 'border-gray-200/80 bg-white/90 backdrop-blur-xl',
          )}
          style={{ height: '72px' }}
        >
          {/* Left: exit */}
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              href={`/editor/${documentId}`}
              className={cn(
                'flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
                isDark
                  ? 'text-white/50 hover:bg-white/8 hover:text-white'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-800',
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Exit</span>
            </Link>
          </div>

          {/* Center: reset · play/pause · voice indicator */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              onClick={reset}
              className={cn(
                'min-h-[40px] min-w-[40px] rounded-lg p-2 transition-all',
                isDark
                  ? 'text-white/40 hover:bg-white/8 hover:text-white'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-800',
              )}
              title="Reset (R)"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <button
              onClick={toggle}
              className={cn(
                'flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full shadow-lg transition-all active:scale-95',
                isPlaying
                  ? isDark
                    ? 'bg-white text-gray-900 hover:bg-white/90'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                  : isDark
                    ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-300'
                    : 'bg-amber-500 text-white hover:bg-amber-400',
              )}
              title="Play / Pause (Space)"
            >
              {isPlaying
                ? <Pause className="h-5 w-5" />
                : <Play className="h-5 w-5 translate-x-0.5" />}
            </button>

            {/* Sync-mode toggle: click to switch between TTS narrate ↔ mic listen */}
            <button
              onClick={toggleSyncMode}
              className={cn(
                'flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-all',
                isSyncMode
                  ? isDark
                    ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25'
                    : 'bg-indigo-100 text-indigo-600'
                  : isSpeaking
                  ? isDark
                    ? 'bg-yellow-500/12 text-yellow-400'
                    : 'bg-amber-50 text-amber-600'
                  : isDark
                  ? 'text-white/20 hover:text-white/60 hover:bg-white/[0.06]'
                  : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100',
              )}
              title={isSyncMode ? 'Mic sync ON — press V or click to switch to narrate mode' : 'Click or press V to enable mic sync (you speak, text follows)'}
            >
              {isListening || isSpeaking
                ? <Mic className="h-4 w-4" style={{ animation: 'livepulse 1s ease-in-out infinite' }} />
                : <Mic className="h-4 w-4" />}
              <span className={cn('hidden sm:inline text-[10px] font-semibold tracking-wide uppercase',
                isSyncMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}>
                {isSyncMode ? 'Sync' : 'TTS'}
              </span>
            </button>
          </div>

          {/* Right: speed · font · mirror · theme */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            {/* Speed */}
            <div className="flex items-center gap-1">
              <Gauge className={cn('h-3.5 w-3.5 shrink-0', isDark ? 'text-white/25' : 'text-gray-300')} />
              <button
                onClick={() => setSpeed(speed - 1)}
                className={cn('min-h-[30px] min-w-[30px] rounded p-1', isDark ? 'text-white/40 hover:bg-white/8' : 'text-gray-400 hover:bg-gray-100')}
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className={cn('w-5 select-none text-center text-xs font-semibold tabular-nums', isDark ? 'text-white' : 'text-gray-800')}>
                {speed}
              </span>
              <button
                onClick={() => setSpeed(speed + 1)}
                className={cn('min-h-[30px] min-w-[30px] rounded p-1', isDark ? 'text-white/40 hover:bg-white/8' : 'text-gray-400 hover:bg-gray-100')}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* Font size — hidden on mobile */}
            <div className="hidden items-center gap-1 sm:flex">
              <span className={cn('select-none text-xs font-medium', isDark ? 'text-white/25' : 'text-gray-300')}>Aa</span>
              <button
                onClick={() => setFontSize(fontSize - 2)}
                className={cn('min-h-[30px] min-w-[30px] rounded p-1', isDark ? 'text-white/40 hover:bg-white/8' : 'text-gray-400 hover:bg-gray-100')}
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className={cn('w-6 select-none text-center text-xs font-semibold tabular-nums', isDark ? 'text-white' : 'text-gray-800')}>
                {fontSize}
              </span>
              <button
                onClick={() => setFontSize(fontSize + 2)}
                className={cn('min-h-[30px] min-w-[30px] rounded p-1', isDark ? 'text-white/40 hover:bg-white/8' : 'text-gray-400 hover:bg-gray-100')}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* Mirror */}
            <button
              onClick={toggleMirror}
              className={cn(
                'min-h-[40px] min-w-[40px] rounded-lg p-2 transition-all',
                mirror
                  ? isDark ? 'bg-yellow-500/15 text-yellow-400' : 'bg-amber-100 text-amber-600'
                  : isDark ? 'text-white/40 hover:bg-white/8 hover:text-white' : 'text-gray-400 hover:bg-gray-100',
              )}
              title="Mirror (M)"
            >
              <FlipHorizontal className="h-4 w-4" />
            </button>

            {/* Theme */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={cn(
                'min-h-[40px] min-w-[40px] rounded-lg p-2 transition-all',
                isDark
                  ? 'text-white/40 hover:bg-white/8 hover:text-white'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-800',
              )}
              title="Toggle theme"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* ── Keyboard hints ────────────────────────────────────────────── */}
        <div
          className={cn(
            'relative z-30 hidden justify-center gap-5 pb-2 text-[11px] md:flex',
            isDark ? 'bg-[#111113]/90 text-white/15' : 'bg-white/90 text-gray-300',
          )}
        >
          {[
            { key: 'Space', label: 'Play/Pause' },
            { key: 'R',     label: 'Reset'      },
            { key: 'V',     label: 'Sync mode'  },
            { key: '↑ ↓',  label: 'Speed'      },
            { key: '+ −',  label: 'Font size'   },
            { key: 'M',     label: 'Mirror'     },
          ].map(({ key, label }) => (
            <span key={key}>
              <kbd className="font-mono">{key}</kbd> {label}
            </span>
          ))}
        </div>

        {/* ── Progress bar ─────────────────────────────────────────────── */}
        <div
          className={cn(
            'relative z-30 h-[3px] w-full shrink-0',
            isDark ? 'bg-white/[0.06]' : 'bg-gray-200',
          )}
        >
          <div
            className={cn(
              'h-full transition-all duration-300',
              isDark ? 'bg-yellow-400' : 'bg-amber-500',
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </>
  );
}

