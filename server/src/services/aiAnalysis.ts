import { AnalysisResult } from '../types';
import { checkGrammar, computeGrammarScore } from './grammarCheck';
import { parseAIResponse, ParsedAIResponse } from '../utils/parseAIResponse';
import { detectTone } from '../utils/tone';
import { runAI } from './aiRouter';
import { analyzeReadability, detectLongSentences } from './ai/readabilityAnalyzer';

const MIN_CHARS = 50;
const MAX_CHARS = 100_000;
const MAX_GRAMMAR_CHARS = 10_000;
const SAMPLE_CHUNK_SIZE = 1000;
const LARGE_TEXT_THRESHOLD = 7000;

function normalizeScore(value: unknown): number | null {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function estimateFallbackAiScore(text: string): number {
  const cleaned = (text || '').trim();
  if (!cleaned) return 0;

  const words = cleaned.split(/\s+/).filter(Boolean);
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentenceCount = Math.max(1, sentences.length);
  const avgWordsPerSentence = words.length / sentenceCount;
  const uniqueRatio = words.length > 0
    ? new Set(words.map((w) => w.toLowerCase())).size / words.length
    : 1;

  let repeatedStarts = 0;
  const firstWords = sentences
    .map((s) => s.split(/\s+/)[0]?.toLowerCase() || '')
    .filter(Boolean);
  for (let i = 1; i < firstWords.length; i += 1) {
    if (firstWords[i] === firstWords[i - 1]) repeatedStarts += 1;
  }

  let score = 35;

  if (avgWordsPerSentence >= 24) score += 12;
  else if (avgWordsPerSentence >= 18) score += 7;
  else if (avgWordsPerSentence <= 8) score += 5;

  if (uniqueRatio < 0.45) score += 16;
  else if (uniqueRatio < 0.55) score += 10;
  else if (uniqueRatio > 0.72) score -= 8;

  const repeatedStartRatio = firstWords.length > 0 ? repeatedStarts / firstWords.length : 0;
  if (repeatedStartRatio > 0.25) score += 10;
  else if (repeatedStartRatio > 0.15) score += 6;

  const punctuationDensity = (cleaned.match(/[,:;()-]/g) || []).length / Math.max(1, words.length);
  if (punctuationDensity > 0.18) score += 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function splitText(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    const part = text.slice(i, i + size).trim();
    if (part) out.push(part);
  }
  return out;
}

function buildRepresentativeSample(text: string): string {
  if (text.length <= LARGE_TEXT_THRESHOLD) return text;

  const chunks = splitText(text, SAMPLE_CHUNK_SIZE);
  if (chunks.length <= 3) return chunks.join('\n\n');

  const mid = Math.floor(chunks.length / 2);
  return [chunks[0], chunks[mid], chunks[chunks.length - 1]].join('\n\n');
}

function buildUnifiedPrompt(text: string): string {
  return [
    'You are a strict JSON API.',
    'Return ONLY valid JSON.',
    'Do NOT include markdown.',
    'Do NOT include explanation.',
    '',
    'Format:',
    '{',
    '  "score": number (0-100),',
    '  "readability": "string",',
    '  "grammarIssues": ["string"],',
    '  "suggestions": ["string"],',
    '  "improvedText": "string"',
    '}',
    '',
    'Text:',
    text.slice(0, 12000),
  ].join('\n');
}

async function runAnalysisWithRetry(prompt: string): Promise<{ parsed: ParsedAIResponse | null; provider: string; warning?: string }> {
  const ai = await runAI({
    prompt,
    modelPreferences: {
      groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
      openrouter: ['openrouter/auto'],
    },
    temperature: 0.2,
    maxTokens: 900,
    forceFresh: true,
    validateResult: (text) => parseAIResponse(text) !== null,
  });
  console.log('Analyzer provider:', ai.provider || 'unavailable');

  if (!ai.success || !ai.text) {
    return {
      parsed: null,
      provider: ai.provider || 'fallback',
      warning: ai.message || 'AI temporarily unavailable',
    };
  }

  const parsed = parseAIResponse(ai.text);

  if (!parsed) {
    return {
      parsed: null,
      provider: ai.provider || 'fallback',
      warning: 'AI returned invalid JSON payload',
    };
  }

  return {
    parsed,
    provider: ai.provider || 'fallback',
  };
}

export async function analyzeDocument(text: string, userId?: string): Promise<AnalysisResult> {
  if (!text || text.trim().length < MIN_CHARS) {
    throw new Error(`Text too short (min ${MIN_CHARS} chars)`);
  }
  
  if (text.length > MAX_CHARS) {
    throw new Error(`Text too long (max ${MAX_CHARS} chars)`);
  }

  const sampledText = buildRepresentativeSample(text);
  const cleanText = text.trim().slice(0, 4000);
  const prompt = buildUnifiedPrompt(cleanText);
  const readability = analyzeReadability(sampledText);
  const longSentences = detectLongSentences(sampledText);

  const [grammarIssues, aiOut] = await Promise.all([
    checkGrammar(sampledText.slice(0, MAX_GRAMMAR_CHARS)),
    runAnalysisWithRetry(prompt),
  ]);

  const parsed = aiOut.parsed;
  const aiSuggestions = parsed?.suggestions ?? [];
  const aiReasoning = parsed
    ? `AI engine (${aiOut.provider}) score generated. Readability: ${parsed.readability}`
    : `AI engine (${aiOut.provider}) fallback used. ${aiOut.warning || 'AI temporarily unavailable.'}`;
  const improvedText = parsed?.improvedText ?? sampledText;
  const aiScore = normalizeScore(parsed?.score);
  const fallbackAiScore = estimateFallbackAiScore(sampledText);
  const fallbackTips = [
    'Break long sentences into shorter, natural lines.',
    'Vary sentence openings and transitions to reduce repetition.',
    'Prefer concrete verbs and examples over generic filler wording.',
    'Remove repeated phrases that do not add new information.',
    'Keep paragraph flow logical and concise.',
  ];
  const humanizationTips = aiSuggestions.slice(0, 5).length > 0 ? aiSuggestions.slice(0, 5) : fallbackTips;

  const humanizationSuggestions = aiSuggestions.slice(0, 6).map((suggestion, idx) => ({
    sentenceIndex: idx,
    originalSentence: '',
    rewrittenSentence: improvedText,
    original: '',
    suggestion,
    reason: 'Unified AI suggestion',
  }));

  const wordCount = sampledText.trim().split(/\s+/).filter(Boolean).length;
  const readabilityScore = readability.score;
  const tone = detectTone(text);
  const grammarScore = computeGrammarScore(wordCount, grammarIssues);

  const finalScore = aiScore ?? fallbackAiScore;

  return {
    aiScore: finalScore,
    aiReasoning,
    humanizationTips,
    humanizationSuggestions,
    claimFlags: (parsed?.grammarIssues ?? []).slice(0, 10),
    grammarIssues,
    grammarScore,
    readabilityScore,
    fleschGradeLevel: readability.fleschGradeLevel,
    avgSentenceLength: readability.avgSentenceLength,
    readingTimeMinutes: readability.readingTimeMinutes,
    longSentences,
    wordCount,
    sentenceCount: readability.sentenceCount,
    tone,
    analyzedAt: new Date()
  };
}
