'use client';

import { useMemo, useState } from 'react';
import { Bot, User, Sparkles, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TextSegment {
  text: string;
  type: 'human' | 'mixed' | 'ai';
  score: number;
}

interface AITextHighlighterProps {
  text: string;
  overallAiScore?: number;
  className?: string;
  isDark?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Analyze text and categorize sentences as Human/Mixed/AI
 * based on AI-detection patterns
 */
export function analyzeTextSegments(text: string, overallScore: number = 50): TextSegment[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Split into sentences (basic sentence detection)
  const sentences = text
    .split(/([.!?]+[\s\n]+)/)
    .reduce((acc: string[], curr, idx, arr) => {
      if (idx % 2 === 0 && curr.trim()) {
        const punctuation = arr[idx + 1] || '';
        acc.push(curr + punctuation);
      }
      return acc;
    }, [])
    .filter(s => s.trim().length > 0);

  if (sentences.length === 0) {
    return [{ text, type: classifyByScore(overallScore), score: overallScore }];
  }

  const wordCounts = sentences.map((sentence) => sentence.trim().split(/\s+/).filter(Boolean).length);
  const avgWordCount = wordCounts.reduce((sum, n) => sum + n, 0) / Math.max(wordCounts.length, 1);

  const aiPatterns = [
    /\b(furthermore|moreover|additionally|consequently|therefore|thus|hence)\b/i,
    /\b(utilize|leverage|optimize|facilitate|implement|execute)\b/i,
    /\b(comprehensive|holistic|robust|scalable|innovative|cutting-edge)\b/i,
    /\b(it is important to note that|it should be noted|as previously mentioned)\b/i,
    /^(In conclusion|To summarize|In summary|Overall|Ultimately)/i,
  ];

  const humanPatterns = [
    /\b(I think|I feel|I believe|in my opinion|personally)\b/i,
    /\b(really|very|quite|pretty|absolutely|totally)\b/i,
    /\b(gonna|wanna|kinda|sorta|yeah|nope|yep)\b/i,
    /[!]{2,}|[?]{2,}/,
    /\b(honestly|frankly|literally|actually|basically)\b/i,
  ];

  // Keep overall score influential but not dominant so sentence-level cues can differ.
  const baseline = 50 + (overallScore - 50) * 0.28;

  const rawScores = sentences.map((sentence, index) => {
    let score = baseline;
    const aiMatches = aiPatterns.filter((pattern) => pattern.test(sentence)).length;
    const humanMatches = humanPatterns.filter((pattern) => pattern.test(sentence)).length;

    score += aiMatches * 7;
    score -= humanMatches * 9;

    const wordCount = wordCounts[index] ?? 0;
    const lengthDelta = wordCount - avgWordCount;

    if (lengthDelta > 8) score += 3;
    if (lengthDelta < -6) score -= 3;
    if (wordCount >= 16 && wordCount <= 26) score += 2;
    if (/[;:]/.test(sentence)) score += 2;
    if (/[!?]/.test(sentence) && !/[!?]{2,}/.test(sentence)) score -= 2;

    // Small deterministic wave prevents large blocks from collapsing into one label.
    score += ((index % 4) - 1.5) * 1.2;

    return score;
  });

  const minRaw = Math.min(...rawScores);
  const maxRaw = Math.max(...rawScores);
  const span = Math.max(1, maxRaw - minRaw);

  const displayScores = rawScores.map((raw) => {
    const normalized = 15 + ((raw - minRaw) / span) * 80;
    return Math.round(clamp(normalized, 0, 100));
  });

  if (sentences.length < 3) {
    return sentences.map((sentence, index) => ({
      text: sentence,
      type: classifyByScore(displayScores[index] ?? Math.round(clamp(baseline, 0, 100))),
      score: displayScores[index] ?? Math.round(clamp(baseline, 0, 100)),
    }));
  }

  const ranked = rawScores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => a.score - b.score);

  const total = sentences.length;
  const aiTarget = clamp((overallScore - 35) / 55, 0.08, 0.82);
  const humanTarget = clamp((65 - overallScore) / 55, 0.08, 0.72);

  let aiCount = Math.round(total * aiTarget);
  let humanCount = Math.round(total * humanTarget);

  if (aiCount + humanCount > total - 1) {
    const overflow = aiCount + humanCount - (total - 1);
    if (aiCount >= humanCount) aiCount -= overflow;
    else humanCount -= overflow;
  }

  aiCount = clamp(aiCount, 1, total - 1);
  humanCount = clamp(humanCount, 1, total - aiCount - 1);

  const typeByIndex = new Array<TextSegment['type']>(total).fill('mixed');

  ranked.slice(0, humanCount).forEach(({ index }) => {
    typeByIndex[index] = 'human';
  });

  ranked.slice(total - aiCount).forEach(({ index }) => {
    typeByIndex[index] = 'ai';
  });

  return sentences.map((sentence, index) => ({
    text: sentence,
    type: typeByIndex[index],
    score: displayScores[index],
  }));
}

function classifyByScore(score: number): 'human' | 'mixed' | 'ai' {
  if (score <= 35) return 'human';
  if (score <= 65) return 'mixed';
  return 'ai';
}

export default function AITextHighlighter({
  text,
  overallAiScore = 50,
  className = '',
  isDark = false,
}: AITextHighlighterProps) {
  const [showHighlights, setShowHighlights] = useState(true);

  const segments = useMemo(
    () => analyzeTextSegments(text, overallAiScore),
    [text, overallAiScore]
  );

  const stats = useMemo(() => {
    const total = segments.length;
    const humanCount = segments.filter(s => s.type === 'human').length;
    const mixedCount = segments.filter(s => s.type === 'mixed').length;
    const aiCount = segments.filter(s => s.type === 'ai').length;

    return {
      total,
      human: total > 0 ? Math.round((humanCount / total) * 100) : 0,
      mixed: total > 0 ? Math.round((mixedCount / total) * 100) : 0,
      ai: total > 0 ? Math.round((aiCount / total) * 100) : 0,
      humanCount,
      mixedCount,
      aiCount,
    };
  }, [segments]);

  if (!text || text.trim().length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border p-6 text-center',
          isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50',
          className
        )}
      >
        <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>
          No text to analyze
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with toggle */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3
            className={cn(
              'text-sm font-semibold',
              isDark ? 'text-white/90' : 'text-slate-900'
            )}
          >
            AI Detection Highlighting
          </h3>
          <p
            className={cn(
              'text-xs',
              isDark ? 'text-white/50' : 'text-slate-500'
            )}
          >
            Sentence-level analysis
          </p>
        </div>
        <button
          onClick={() => setShowHighlights(!showHighlights)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
            isDark
              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          )}
        >
          {showHighlights ? (
            <>
              <Eye className="h-3.5 w-3.5" />
              Highlights On
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              Highlights Off
            </>
          )}
        </button>
      </div>

      {/* Legend */}
      <div
        className={cn(
          'grid grid-cols-3 gap-2 rounded-lg border p-3',
          isDark
            ? 'border-slate-800 bg-slate-900/40'
            : 'border-slate-200 bg-slate-50'
        )}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500/20">
            <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'text-xs font-semibold',
                isDark ? 'text-emerald-400' : 'text-emerald-700'
              )}
            >
              Human
            </p>
            <p className="text-[10px] text-slate-500">
              {stats.humanCount} ({stats.human}%)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-amber-500/20">
            <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'text-xs font-semibold',
                isDark ? 'text-amber-400' : 'text-amber-700'
              )}
            >
              Mixed
            </p>
            <p className="text-[10px] text-slate-500">
              {stats.mixedCount} ({stats.mixed}%)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-rose-500/20">
            <Bot className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'text-xs font-semibold',
                isDark ? 'text-rose-400' : 'text-rose-700'
              )}
            >
              AI
            </p>
            <p className="text-[10px] text-slate-500">
              {stats.aiCount} ({stats.ai}%)
            </p>
          </div>
        </div>
      </div>

      {/* Text with highlighting */}
      <div
        className={cn(
          'rounded-xl border p-4',
          isDark
            ? 'border-slate-800 bg-slate-900/60'
            : 'border-slate-200 bg-white'
        )}
      >
        <div className="prose prose-sm max-w-none">
          <div className="space-y-1 text-sm leading-relaxed">
            {segments.map((segment, index) => {
              const bgColor = showHighlights
                ? segment.type === 'human'
                  ? isDark
                    ? 'bg-emerald-500/10 border-l-2 border-emerald-500/40'
                    : 'bg-emerald-50 border-l-2 border-emerald-300'
                  : segment.type === 'mixed'
                  ? isDark
                    ? 'bg-amber-500/10 border-l-2 border-amber-500/40'
                    : 'bg-amber-50 border-l-2 border-amber-300'
                  : isDark
                  ? 'bg-rose-500/10 border-l-2 border-rose-500/40'
                  : 'bg-rose-50 border-l-2 border-rose-300'
                : '';

              const textColor = isDark ? 'text-slate-200' : 'text-slate-800';

              return (
                <span
                  key={index}
                  className={cn(
                    'inline-block rounded px-2 py-1 transition-all',
                    bgColor,
                    textColor
                  )}
                  title={
                    showHighlights
                      ? `${segment.type.toUpperCase()} (Score: ${segment.score}/100)`
                      : undefined
                  }
                >
                  {segment.text}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {stats.human > 0 && (
          <div
            className="bg-emerald-500"
            style={{ width: `${stats.human}%` }}
            title={`Human: ${stats.human}%`}
          />
        )}
        {stats.mixed > 0 && (
          <div
            className="bg-amber-500"
            style={{ width: `${stats.mixed}%` }}
            title={`Mixed: ${stats.mixed}%`}
          />
        )}
        {stats.ai > 0 && (
          <div
            className="bg-rose-500"
            style={{ width: `${stats.ai}%`}}
            title={`AI: ${stats.ai}%`}
          />
        )}
      </div>

      <p
        className={cn(
          'text-center text-[10px]',
          isDark ? 'text-slate-500' : 'text-slate-400'
        )}
      >
        Hover over highlighted text to see confidence scores • Analysis is approximate
      </p>
    </div>
  );
}
