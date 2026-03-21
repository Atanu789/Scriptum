import { AnalysisResult } from '../types';
import { checkGrammar, computeGrammarScore } from './grammarCheck';
import { analyzeReadability, detectLongSentences } from './ai/readabilityAnalyzer';
import { runAI } from './aiRouter';
import { parseAIResponse, ParsedAIResponse } from '../utils/parseAIResponse';
import { calculateReadability } from '../utils/readability';
import { detectTone } from '../utils/tone';

const MIN_CHARS = 50;
const MAX_CHARS = 100_000;
const MAX_GRAMMAR_CHARS = 10_000;
const ANALYSIS_RETRY_ATTEMPTS = 2;

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
  for (let attempt = 1; attempt <= ANALYSIS_RETRY_ATTEMPTS; attempt += 1) {
    const aiRes = await runAI({
      prompt,
      userId,
      modelPreferences: {
        groq: ['llama-3.1-8b-instant'],
        openrouter: ['meta-llama/llama-3.1-8b-instruct:free'],
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

  throw new Error('AI failed to generate valid response');
}

export async function analyzeDocument(text: string, userId?: string): Promise<AnalysisResult> {
  if (!text || text.trim().length < MIN_CHARS) {
    throw new Error(`Text too short (min ${MIN_CHARS} chars)`);
  }
  
  if (text.length > MAX_CHARS) {
    throw new Error(`Text too long (max ${MAX_CHARS} chars)`);
  }

  const prompt = buildUnifiedPrompt(text);

  const [readability, grammarIssues, aiOut] = await Promise.all([
    Promise.resolve(analyzeReadability(text)),
    checkGrammar(text.slice(0, MAX_GRAMMAR_CHARS)),
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

  const longSentences = detectLongSentences(text);
  const localReadabilityScore = calculateReadability(text);
  const readabilityScore = Number.isFinite(readability.score) ? readability.score : localReadabilityScore;
  const tone = detectTone(text);
  const grammarScore = computeGrammarScore(readability.wordCount, grammarIssues);

  return {
    aiScore,
    aiReasoning,
    humanizationTips,
    humanizationSuggestions,
    claimFlags: parsed.grammarIssues.slice(0, 10),
    grammarIssues,
    grammarScore,
    readabilityScore,
    fleschGradeLevel: readability.fleschGradeLevel,
    avgSentenceLength: readability.avgSentenceLength,
    readingTimeMinutes: readability.readingTimeMinutes,
    longSentences,
    wordCount: readability.wordCount,
    sentenceCount: readability.sentenceCount,
    tone,
    analyzedAt: new Date()
  };
}
