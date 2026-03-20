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

function cleanTeleprompterToken(raw: string): string {
  const withoutControls = raw
    .replace(/\u0000/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Drop pure zero artifacts (e.g. standalone "0" tokens between words).
  if (/^0+$/.test(withoutControls)) return '';

  if (!/[A-Za-z]/.test(withoutControls)) return withoutControls;

  return withoutControls
    // Remove zero(s) before words, including punctuated forms like "(0Cellular".
    .replace(/(^|[^A-Za-z0-9'])0+(?=[A-Za-z])/g, '$1')
    // Remove trailing zero(s) after words, including punctuated forms like "Think0)".
    .replace(/(?<=[A-Za-z])0+(?=($|[^A-Za-z0-9']))/g, '');
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

    const normalizedScript = script
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const lines = normalizedScript.split('\n');
    const tokens: Token[] = [];
    let pendingBreaks = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      if (lineIndex > 0) pendingBreaks += 1;

      const line = lines[lineIndex] ?? '';
      if (!line.trim()) continue;

      const words = line.match(/\S+/g) || [];
      for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
        const word = cleanTeleprompterToken(words[wordIndex]);
        const normalized = normalizeWord(word);
        if (!normalized) continue;

        const token: Token = {
          original: word,
          normalized,
          index: tokens.length,
        };

        if (wordIndex === 0 && pendingBreaks > 0) {
          token.breaksBefore = pendingBreaks;
          pendingBreaks = 0;
        }

        tokens.push(token);
      }
    }

    return tokens;
  }, [script]);
}
