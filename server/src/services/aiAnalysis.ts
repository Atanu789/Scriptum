import { AnalysisResult } from '../types';
import { checkGrammar, computeGrammarScore } from './grammarCheck';
import { runAI } from './aiRouter';
import { parseAIResponse, ParsedAIResponse } from '../utils/parseAIResponse';
import { detectTone } from '../utils/tone';

const MIN_CHARS = 50;
const MAX_CHARS = 100_000;
const MAX_GRAMMAR_CHARS = 10_000;
const ANALYSIS_RETRY_ATTEMPTS = 2;
const SAMPLE_CHUNK_SIZE = 1000;
const LARGE_TEXT_THRESHOLD = 7000;

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

async function runAnalysisWithRetry(prompt: string, userId?: string): Promise<{ parsed: ParsedAIResponse; provider: string }> {
  let lastFailureMessage = 'AI failed to generate valid response';

  for (let attempt = 1; attempt <= ANALYSIS_RETRY_ATTEMPTS; attempt += 1) {
    const aiRes = await runAI({
      prompt,
      userId,
      modelPreferences: {
        groq: ['llama-3.1-8b-instant'],
        openrouter: ['openrouter/auto'],
      },
      temperature: 0.2,
      maxTokens: 900,
      forceFresh: attempt > 1,
      validateResult: (text) => {
        const parsed = parseAIResponse(text);
        return Boolean(parsed && parsed.score > 0);
      },
    });

    if (!aiRes.success || !aiRes.text) {
      if (aiRes.message) {
        lastFailureMessage = aiRes.message;
      }
      continue;
    }

    console.log('RAW AI RESPONSE:', aiRes.text);
    const parsed = parseAIResponse(aiRes.text);

    if (parsed && parsed.score > 0) {
      return {
        parsed,
        provider: aiRes.provider || 'unknown',
      };
    }

    console.warn(`[Analysis] Invalid AI response, retrying... attempt ${attempt}`);
  }

  throw new Error(lastFailureMessage);
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
    runAnalysisWithRetry(prompt, userId),
  ]);

  const parsed = aiOut.parsed;
  const aiScore = parsed.score;
  const aiSuggestions = parsed.suggestions;
  const aiReasoning = `AI router (${aiOut.provider}) score generated. Readability: ${parsed.readability}`;
  const improvedText = parsed.improvedText;
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
    claimFlags: parsed.grammarIssues.slice(0, 10),
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
