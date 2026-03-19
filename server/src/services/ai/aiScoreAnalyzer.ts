import { callGemini } from './geminiClient';
import { HumanizeMode, ToneResult } from '../../types';

interface AIScoreResult {
  aiScore: number;
  aiReasoning: string;
  humanizationTips: string[];
  humanizationSuggestions: Array<{
    sentenceIndex: number;
    originalSentence: string;
    rewrittenSentence: string;
    original: string;
    suggestion: string;
    reason: string;
  }>;
  tone: ToneResult;
  claimFlags: string[];
}

interface MasterPromptResponse {
  aiScore?: number;
  reasoning?: string;
  humanizationTips?: string[];
  humanizationSuggestions?: Array<{ original?: string; suggestion?: string; reason?: string }>;
  tone?: {
    type?: string;
    confidence?: number;
  };
  biasFlags?: string[];
  claimFlags?: string[];
}

interface SentenceRewrite {
  sentenceIndex: number;
  originalSentence: string;
  rewrittenSentence: string;
  reason: string;
}

interface SentenceRewriteResponse {
  rewrites?: Array<{
    sentenceIndex?: number;
    originalSentence?: string;
    rewrittenSentence?: string;
    reason?: string;
  }>;
}

const SAMPLE_CHARS = 3000;
const HUMANIZATION_TIP_COUNT = 5;
const MAX_HUMANIZE_SENTENCES = 80;

function extractJSON(text: string): MasterPromptResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  return JSON.parse(jsonMatch[0]);
}

function extractRewriteJSON(text: string): SentenceRewriteResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in rewrite response');
  return JSON.parse(jsonMatch[0]);
}

function clampScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeReasoning(value: unknown): string {
  const text = normalizeString(value, 'Analysis completed successfully.');
  if (!text) return 'Analysis completed successfully.';
  return text.length > 220 ? `${text.slice(0, 217).trim()}...` : text;
}

function modeInstruction(mode: HumanizeMode): string {
  if (mode === 'conservative') {
    return 'Rewrite conservatively with minimal wording change. Preserve sentence length very closely.';
  }
  if (mode === 'aggressive') {
    return 'Rewrite aggressively for natural flow while preserving exact meaning and facts.';
  }
  return 'Rewrite in a balanced way: improve naturalness with moderate wording changes.';
}

export function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeRewrittenSentence(value: unknown): string {
  const text = normalizeString(value);
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

export function validateSentenceRewrite(
  original: string,
  rewritten: string,
  mode: HumanizeMode
): boolean {
  const o = original.trim();
  const r = rewritten.trim();
  if (!o || !r) return false;

  const origLen = Math.max(1, o.length);
  const ratio = r.length / origLen;
  const bounds = mode === 'conservative'
    ? { min: 0.75, max: 1.25 }
    : mode === 'aggressive'
    ? { min: 0.45, max: 1.9 }
    : { min: 0.6, max: 1.5 };

  if (ratio < bounds.min || ratio > bounds.max) return false;
  if (!/[A-Za-z0-9]/.test(r)) return false;
  return true;
}

export function lengthSimilarity(original: string, rewritten: string): number {
  const o = Math.max(1, original.trim().length);
  const r = Math.max(1, rewritten.trim().length);
  const similarity = 1 - Math.abs(o - r) / o;
  return Math.max(0, Math.min(1, similarity));
}

function normalizeTone(value: MasterPromptResponse['tone'], biasFlags: string[]): ToneResult {
  const toneType = normalizeString(value?.type, 'neutral').toLowerCase();
  const toneConfidence = Number(value?.confidence);
  const confidence = Number.isFinite(toneConfidence)
    ? Math.max(0, Math.min(1, toneConfidence))
    : 0.5;

  return {
    dominantTone: toneType || 'neutral',
    confidence,
    breakdown: { [toneType || 'neutral']: confidence },
    biasFlags,
  };
}

function countWordNgrams(text: string, n: number): Map<string, number> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const grams = new Map<string, number>();
  for (let i = 0; i <= tokens.length - n; i += 1) {
    const gram = tokens.slice(i, i + n).join(' ');
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

function sentenceLengths(text: string): number[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/).filter(Boolean).length)
    .filter((len) => len > 0);
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function applyStabilityHeuristics(baseScore: number, text: string): number {
  let adjusted = baseScore;

  // Heuristic #1: repeated 3-word phrases raise AI likelihood slightly.
  const trigrams = countWordNgrams(text, 3);
  const repeatedTrigrams = Array.from(trigrams.values()).filter((count) => count >= 3).length;
  if (repeatedTrigrams >= 2) {
    adjusted += Math.min(8, repeatedTrigrams * 2);
  }

  // Heuristic #2: very uniform sentence lengths can indicate generated rhythm.
  const lengths = sentenceLengths(text);
  if (lengths.length >= 6) {
    const sd = standardDeviation(lengths);
    if (sd < 4.2) adjusted += 6;
    else if (sd < 6) adjusted += 3;
  }

  return Math.max(0, Math.min(100, Math.round(adjusted)));
}

function ensureSpecificTips(tips: string[]): string[] {
  const defaults = [
    'Break long sentences into two shorter lines where possible.',
    'Add one concrete example to support each major claim.',
    'Vary sentence openings to avoid repetitive rhythm.',
    'Replace generic transition words with precise connectors.',
    'Trim repeated phrases and keep only the strongest wording.',
  ];

  const merged = [...tips, ...defaults]
    .map((tip) => tip.trim())
    .filter(Boolean)
    .slice(0, HUMANIZATION_TIP_COUNT);

  return merged;
}

function buildMasterPrompt(sample: string): string {
  return `You are an expert editorial and AI-pattern analysis assistant.

Analyze the text and return ONLY valid JSON in this exact schema:
{
  "aiScore": number,
  "reasoning": string,
  "humanizationTips": string[],
  "humanizationSuggestions": [
    {
      "original": string,
      "suggestion": string,
      "reason": string
    }
  ],
  "tone": {
    "type": string,
    "confidence": number
  },
  "biasFlags": string[],
  "claimFlags": string[]
}

Rules:
- Return JSON only. No markdown. No prose.
- aiScore must be an integer from 0 to 100.
- reasoning must be short and professional (max 2 sentences).
- humanizationTips must include 5 specific rewrite actions.
- humanizationSuggestions should include 3 to 6 items when aiScore >= 20.
- "original" must be verbatim from input text (max 80 words).
- claimFlags should include factual claims worth verifying.
- Keep all outputs concise and practical.
- Do not hallucinate claims that are not present.

Text:
${sample}`;
}

function buildSentenceRewritePrompt(sentences: string[], mode: HumanizeMode): string {
  const payload = sentences
    .slice(0, MAX_HUMANIZE_SENTENCES)
    .map((sentence, index) => `${index}: ${sentence}`)
    .join('\n');

  return `You are a professional editor rewriting text to sound natural and human.

Task:
- Review the sentence list.
- Return rewrites only for sentences that sound robotic, repetitive, or overly formulaic.
- ${modeInstruction(mode)}

Return ONLY valid JSON in this exact schema:
{
  "rewrites": [
    {
      "sentenceIndex": number,
      "originalSentence": string,
      "rewrittenSentence": string,
      "reason": string
    }
  ]
}

Rules:
- Do NOT add or remove factual meaning.
- Do NOT add new facts or claims.
- Keep rewrittenSentence close in length to originalSentence.
- Keep punctuation natural.
- If no sentence needs rewriting, return {"rewrites":[]}.
- No markdown. No extra text. JSON only.

Sentence list:
${payload}`;
}

function buildSingleSentencePrompt(sentence: string, mode: HumanizeMode): string {
  return `Rewrite the following sentence to sound more human.
${modeInstruction(mode)}

Constraints:
- Preserve meaning exactly.
- Do not add new information.
- Keep sentence length similar.
- Return plain text only (no quotes, no markdown).

Sentence:
${sentence}`;
}

export async function generateSentenceRewriteSuggestions(
  sentences: string[],
  mode: HumanizeMode
): Promise<SentenceRewrite[]> {
  if (sentences.length === 0) return [];
  const prompt = buildSentenceRewritePrompt(sentences, mode);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const retryHint = attempt === 0 ? '' : '\nReturn JSON only. No explanation.';
      const response = await callGemini(`${prompt}${retryHint}`);
      const parsed = extractRewriteJSON(response);
      const rewrites = Array.isArray(parsed.rewrites) ? parsed.rewrites : [];

      return rewrites
        .map((item) => ({
          sentenceIndex: Number(item.sentenceIndex),
          originalSentence: normalizeString(item.originalSentence),
          rewrittenSentence: normalizeRewrittenSentence(item.rewrittenSentence),
          reason: normalizeString(item.reason),
        }))
        .filter((item) => Number.isInteger(item.sentenceIndex))
        .filter((item) => item.sentenceIndex >= 0 && item.sentenceIndex < sentences.length)
        .filter((item) => item.rewrittenSentence.length > 0)
        .filter((item) => validateSentenceRewrite(sentences[item.sentenceIndex], item.rewrittenSentence, mode));
    } catch (err) {
      if (attempt === 1) {
        console.error('[Humanize Suggestions] Error:', err);
      }
    }
  }

  return [];
}

export async function rewriteSingleSentenceWithMode(
  sentence: string,
  mode: HumanizeMode
): Promise<string> {
  const prompt = buildSingleSentencePrompt(sentence, mode);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const output = (await callGemini(prompt))
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/```$/i, '')
        .trim();
      if (validateSentenceRewrite(sentence, output, mode)) {
        return normalizeRewrittenSentence(output);
      }
    } catch (err) {
      if (attempt === 1) {
        console.error('[Single Sentence Rewrite] Error:', err);
      }
    }
  }

  return sentence;
}

export async function analyzeAIScore(text: string): Promise<AIScoreResult> {
  const sample = text.slice(0, SAMPLE_CHARS);
  const prompt = buildMasterPrompt(sample);

  const fallback: AIScoreResult = {
    aiScore: 0,
    aiReasoning: 'Analysis unavailable. Using safe fallback output.',
    humanizationTips: ensureSpecificTips([]),
    humanizationSuggestions: [],
    tone: {
      dominantTone: 'neutral',
      confidence: 0.5,
      breakdown: { neutral: 0.5 },
      biasFlags: [],
    },
    claimFlags: [],
  };

  try {
    let parsed: MasterPromptResponse | null = null;

    // Retry once if JSON parsing fails or schema is invalid.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const retryHint = attempt === 0 ? '' : '\nReturn JSON only. No extra text.';
        const response = await callGemini(`${prompt}${retryHint}`);
        parsed = extractJSON(response);
        break;
      } catch (innerErr) {
        if (attempt === 1) throw innerErr;
      }
    }

    if (!parsed) return fallback;

    const biasFlags = normalizeStringArray(parsed.biasFlags).slice(0, 8);
    const claimFlags = normalizeStringArray(parsed.claimFlags).slice(0, 10);

    const suggestions: AIScoreResult['humanizationSuggestions'] = Array.isArray(parsed.humanizationSuggestions)
      ? parsed.humanizationSuggestions
          .map((s, i) => {
            const originalSentence = normalizeString(s?.original);
            const rewrittenSentence = normalizeString(s?.suggestion);
            return {
              sentenceIndex: i,
              originalSentence,
              rewrittenSentence,
              original: originalSentence,
              suggestion: rewrittenSentence,
              reason: normalizeString(s?.reason),
            };
          })
          .filter((s) => s.originalSentence && s.rewrittenSentence)
          .slice(0, 6)
      : [];

    const baseScore = clampScore(parsed.aiScore);
    const stableScore = applyStabilityHeuristics(baseScore, sample);

    return {
      aiScore: stableScore,
      aiReasoning: normalizeReasoning(parsed.reasoning),
      humanizationTips: ensureSpecificTips(normalizeStringArray(parsed.humanizationTips)),
      humanizationSuggestions: suggestions,
      tone: normalizeTone(parsed.tone, biasFlags),
      claimFlags,
    };
  } catch (err) {
    console.error('[AI Score] Error:', err);
    return fallback;
  }
}

export async function humanizeTextContent(text: string): Promise<string> {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return text;

  const rewritten: string[] = [];
  for (const sentence of sentences) {
    // Keep compatibility for callers that still use this helper.
    rewritten.push(await rewriteSingleSentenceWithMode(sentence, 'balanced'));
  }

  return rewritten
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
