'use client';

import { useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Token {
  /** Original word exactly as it appears in the script */
  original: string;
  /** Lowercased, punctuation-stripped form used for matching */
  normalized: string;
  /** Position of this token in the flat tokens array */
  index: number;
  /** Number of newline characters before this token in the original script */
  breaksBefore?: number;
}

// ─── Normalisation helper (also exported so useWordMatcher can reuse it) ──────

export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9']/g, '') // keep apostrophes (it's, don't, …)
    .trim();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Tokenises a script string into an array of `Token` objects.
 *
 * - Splits on whitespace.
 * - Strips empty tokens.
 * - Normalises each word for matching.
 * - Memoised: only recomputes when `script` changes.
 */
export function useScriptTokens(script: string): Token[] {
  return useMemo<Token[]>(() => {
    if (!script) return [];

    const tokens: Token[] = [];
    let index = 0;

    let cursor = 0;
    const matcher = /\S+/g;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(script)) !== null) {
      const word = match[0];
      const before = script.slice(cursor, match.index);
      const breaksBefore = (before.match(/\n/g) || []).length;
      cursor = match.index + word.length;

      const normalized = normalizeWord(word);
      if (!normalized) continue; // skip tokens that are purely punctuation / whitespace
      tokens.push({ original: word, normalized, index, breaksBefore });
      index++;
    }

    return tokens;
  }, [script]);
}
