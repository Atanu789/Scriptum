'use client';

import { useRef, useCallback } from 'react';
import { Token, normalizeWord } from './useScriptTokens';

// ─── Constants ────────────────────────────────────────────────────────────────

/** How many tokens ahead we search when the first word doesn't match */
const LOOK_AHEAD = 6;
/** Wider window for fuzzy phrase matching to recover from minor STT drift */
const FUZZY_LOOK_AHEAD = 20;
/** Minimum phrase words before fuzzy matching is attempted */
const MIN_PHRASE_WORDS = 3;
/** Maximum phrase words used for fuzzy matching */
const MAX_PHRASE_WORDS = 5;
/** Prevent long fuzzy leaps that feel like desync */
const MAX_FUZZY_JUMP = 10;

function wordSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  // Strong partial credit for common ASR truncation/extension patterns.
  if (a.length >= 3 && b.startsWith(a)) return 0.82;
  if (b.length >= 3 && a.startsWith(b)) return 0.82;

  const minLen = Math.min(a.length, b.length);
  let samePrefix = 0;
  for (let i = 0; i < minLen; i += 1) {
    if (a[i] !== b[i]) break;
    samePrefix += 1;
  }

  return samePrefix >= 3 ? 0.6 : 0;
}

function findBestPhraseMatch(
  spokenWords: string[],
  scriptTokens: Token[],
  startIndex: number,
): { nextPointer: number; score: number } | null {
  if (spokenWords.length < MIN_PHRASE_WORDS) return null;

  const phraseLen = Math.min(MAX_PHRASE_WORDS, spokenWords.length);
  const lastStart = Math.min(scriptTokens.length - phraseLen, startIndex + FUZZY_LOOK_AHEAD);
  if (lastStart < startIndex) return null;

  let bestIndex = -1;
  let bestScore = 0;

  for (let i = startIndex; i <= lastStart; i += 1) {
    let score = 0;
    for (let w = 0; w < phraseLen; w += 1) {
      const scriptWord = scriptTokens[i + w]?.normalized || '';
      const spokenWord = spokenWords[w] || '';
      score += wordSimilarity(spokenWord, scriptWord);
    }

    const normalizedScore = score / phraseLen;
    if (normalizedScore > bestScore) {
      bestScore = normalizedScore;
      bestIndex = i;
    }
  }

  // Keep this conservative so we avoid random jumps.
  if (bestIndex === -1 || bestScore < 0.7) return null;

  const jumpDistance = bestIndex + phraseLen - startIndex;
  if (jumpDistance > MAX_FUZZY_JUMP) return null;

  return {
    nextPointer: Math.min(scriptTokens.length, bestIndex + phraseLen),
    score: bestScore,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseWordMatcherReturn {
  /** Feed a raw transcript chunk. Returns the exact matched token index for highlighting. */
  processChunk: (chunk: string) => number;
  /** Current pointer (tokens consumed so far) */
  getPointer: () => number;
  /** Hard-reset the pointer to 0 (or a specific index) */
  reset: (to?: number) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Forward-only O(n) word matcher.
 *
 * Rules:
 *  - Never scan backwards.
 *  - On mismatch: look up to LOOK_AHEAD tokens ahead; if found, jump there.
 *  - If nothing matches in the window: skip the spoken word, do NOT advance script pointer.
 *  - Only reset if `reset()` is called explicitly.
 */
export function useWordMatcher(scriptTokens: Token[]): UseWordMatcherReturn {
  const pointerRef = useRef<number>(0);
  const lastMatchedRef = useRef<number>(-1);

  const getPointer = useCallback((): number => pointerRef.current, []);

  const reset = useCallback((to = 0): void => {
    pointerRef.current = Math.max(0, Math.min(to, scriptTokens.length - 1));
    lastMatchedRef.current = pointerRef.current - 1;
  }, [scriptTokens.length]);

  const processChunk = useCallback((chunk: string): number => {
    if (!chunk || scriptTokens.length === 0) return pointerRef.current;

    // Normalise and split transcript chunk into individual spoken words
    const spokenWords = chunk
      .split(/\s+/)
      .map(normalizeWord)
      .filter(Boolean);

    for (let spokenIndex = 0; spokenIndex < spokenWords.length; spokenIndex += 1) {
      const spoken = spokenWords[spokenIndex];
      const ptr = pointerRef.current;

      // Already consumed all tokens — stop processing
      if (ptr >= scriptTokens.length) break;

      // ── Case 1: exact match at current pointer ────────────────────────────
      if (scriptTokens[ptr].normalized === spoken) {
        pointerRef.current = ptr + 1;
        lastMatchedRef.current = ptr;
        continue;
      }

      // ── Case 2: look ahead up to LOOK_AHEAD tokens ────────────────────────
      const windowEnd = Math.min(ptr + LOOK_AHEAD, scriptTokens.length);
      let found = false;

      for (let i = ptr + 1; i < windowEnd; i++) {
        if (scriptTokens[i].normalized === spoken) {
          // Jump pointer to one past the match
          pointerRef.current = i + 1;
          lastMatchedRef.current = i;
          found = true;
          break;
        }
      }

      // ── Case 3: no match found — skip this spoken word, keep pointer ──────
      if (!found) {
        // Try fuzzy phrase alignment to recover from ASR drift.
        const remaining = spokenWords.slice(spokenIndex);
        const fuzzy = findBestPhraseMatch(remaining, scriptTokens, ptr);
        if (fuzzy) {
          pointerRef.current = fuzzy.nextPointer;
          lastMatchedRef.current = Math.max(ptr, fuzzy.nextPointer - 1);
          spokenIndex += Math.min(MAX_PHRASE_WORDS, remaining.length) - 1;
        }
      }
    }

    if (lastMatchedRef.current >= 0) {
      return lastMatchedRef.current;
    }

    return Math.max(0, pointerRef.current);
  }, [scriptTokens]);

  return { processChunk, getPointer, reset };
}
