import { ToneResult } from '../types';

const POSITIVE = ['good', 'great', 'excellent', 'amazing', 'clear', 'helpful', 'strong'];
const NEGATIVE = ['bad', 'worst', 'hate', 'poor', 'awful', 'weak', 'biased'];
const BIAS = ['always', 'never', 'obviously', 'clearly', 'everyone', 'nobody', 'must'];

export function detectToneScore(text: string): number {
  const input = (text || '').toLowerCase();
  let score = 50;

  for (const word of POSITIVE) {
    if (input.includes(word)) score += 5;
  }

  for (const word of NEGATIVE) {
    if (input.includes(word)) score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

export function detectTone(text: string): ToneResult {
  const toneScore = detectToneScore(text);
  const confidence = Math.max(0, Math.min(1, toneScore / 100));
  const biasFlags = BIAS.filter((word) => text.toLowerCase().includes(word)).slice(0, 8);

  let dominantTone = 'neutral';
  if (toneScore >= 67) dominantTone = 'positive';
  if (toneScore <= 33) dominantTone = 'negative';

  return {
    dominantTone,
    confidence,
    breakdown: {
      positive: toneScore >= 50 ? confidence : 1 - confidence,
      negative: toneScore < 50 ? 1 - confidence : 1 - confidence,
      neutral: Math.max(0, 1 - Math.abs(0.5 - confidence) * 2),
    },
    biasFlags,
  };
}