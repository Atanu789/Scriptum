import { AnalysisResult } from '../types';
import { checkGrammar, computeGrammarScore } from './grammarCheck';
import { analyzeAIScore } from './ai/aiScoreAnalyzer';
import { analyzeTone } from './ai/toneAnalyzer';
import { detectClaims } from './ai/claimDetector';
import { analyzeReadability, detectLongSentences } from './ai/readabilityAnalyzer';

const MIN_CHARS = 50;
const MAX_CHARS = 100_000;
const MAX_GRAMMAR_CHARS = 10_000;

export async function analyzeDocument(text: string): Promise<AnalysisResult> {
  if (!text || text.trim().length < MIN_CHARS) {
    throw new Error(`Text too short (min ${MIN_CHARS} chars)`);
  }
  
  if (text.length > MAX_CHARS) {
    throw new Error(`Text too long (max ${MAX_CHARS} chars)`);
  }

  const [aiResult, toneResult, claimFlags, readability, grammarIssues] = await Promise.all([
    analyzeAIScore(text),
    analyzeTone(text),
    detectClaims(text),
    Promise.resolve(analyzeReadability(text)),
    checkGrammar(text.slice(0, MAX_GRAMMAR_CHARS))
  ]);

  const longSentences = detectLongSentences(text);
  const grammarScore = computeGrammarScore(readability.wordCount, grammarIssues);

  return {
    aiScore: aiResult.aiScore,
    aiReasoning: aiResult.aiReasoning,
    humanizationTips: aiResult.humanizationTips,
    claimFlags,
    grammarIssues,
    grammarScore,
    readabilityScore: readability.score,
    fleschGradeLevel: readability.fleschGradeLevel,
    avgSentenceLength: readability.avgSentenceLength,
    readingTimeMinutes: readability.readingTimeMinutes,
    longSentences,
    wordCount: readability.wordCount,
    sentenceCount: readability.sentenceCount,
    tone: toneResult,
    analyzedAt: new Date()
  };
}
