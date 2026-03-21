import { AnalysisResult } from '../types';
import { checkGrammar, computeGrammarScore } from './grammarCheck';
import { parseAIResponse, ParsedAIResponse } from '../utils/parseAIResponse';
import { detectTone } from '../utils/tone';
import { runAI } from './aiEngine';

const MIN_CHARS = 50;
const MAX_CHARS = 100_000;
const MAX_GRAMMAR_CHARS = 10_000;
const SAMPLE_CHUNK_SIZE = 1000;
const LARGE_TEXT_THRESHOLD = 7000;

function normalizeScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 50;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return clamped === 0 ? 1 : clamped;
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
  const ai = await runAI(prompt);
  console.log('AI Provider:', ai.provider);

  if (!ai.result) {
    return {
      parsed: null,
      provider: ai.provider,
      warning: 'AI temporarily unavailable',
    };
  }

  const parsed = parseAIResponse(ai.result);
  if (!parsed) {
    return {
      parsed: null,
      provider: ai.provider,
      warning: 'AI returned malformed output',
    };
  }

  return {
    parsed,
    provider: ai.provider,
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
  const prompt = buildUnifiedPrompt(sampledText);

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
  const aiScore = normalizeScore(parsed?.score ?? 50);
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
  const readabilityScore = 0;
  const tone = detectTone(text);
  const grammarScore = computeGrammarScore(wordCount, grammarIssues);

  return {
    aiScore,
    aiReasoning,
    humanizationTips,
    humanizationSuggestions,
    claimFlags: (parsed?.grammarIssues ?? []).slice(0, 10),
    grammarIssues,
    grammarScore,
    readabilityScore,
    fleschGradeLevel: 'N/A',
    avgSentenceLength: 0,
    readingTimeMinutes: 0,
    longSentences: [],
    wordCount,
    sentenceCount: 0,
    tone,
    analyzedAt: new Date()
  };
}
