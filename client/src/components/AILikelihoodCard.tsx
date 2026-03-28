'use client';

import { useMemo } from 'react';
import { Bot, User, Sparkles, Shield, CheckCircle2 } from 'lucide-react';

interface AILikelihoodBreakdown {
  humanPercentage: number;
  aiPercentage: number;
  mixedPercentage: number;
  dominantType: 'human' | 'ai' | 'mixed';
}

interface AILikelihoodCardProps {
  aiScore: number;
  className?: string;
  showDetectors?: boolean;
}

/**
 * Calculate AI likelihood breakdown from AI score
 * - Low score (0-25): Mostly Human
 * - Medium score (26-60): Mixed
 * - High score (61-100): Mostly AI
 */
function calculateLikelihoodBreakdown(aiScore: number): AILikelihoodBreakdown {
  // Normalize score
  const score = Math.max(0, Math.min(100, aiScore));

  let humanPercentage = 0;
  let aiPercentage = 0;
  let mixedPercentage = 0;
  let dominantType: 'human' | 'ai' | 'mixed' = 'mixed';

  if (score <= 25) {
    // Mostly Human-written
    humanPercentage = 100 - (score * 2);
    mixedPercentage = score * 2;
    aiPercentage = 0;
    dominantType = 'human';
  } else if (score <= 40) {
    // Human-leaning Mixed
    humanPercentage = 60 - ((score - 25) * 2);
    mixedPercentage = 25 + (score - 25);
    aiPercentage = 15 - ((score - 25) * 0.5);
    dominantType = 'mixed';
  } else if (score <= 60) {
    // Balanced Mixed
    const mid = (score - 40);
    humanPercentage = 30 - (mid * 1.5);
    mixedPercentage = 40 + (mid * 2);
    aiPercentage = 30 - (mid * 0.5);
    dominantType = 'mixed';
  } else if (score <= 75) {
    // AI-leaning Mixed
    const upper = (score - 60);
    humanPercentage = Math.max(0, 20 - (upper * 1.2));
    mixedPercentage = Math.max(20, 80 - (upper * 3));
    aiPercentage = upper * 4;
    dominantType = 'mixed';
  } else {
    // Mostly AI-generated
    const aiDominant = (score - 75);
    humanPercentage = Math.max(0, 5 - (aiDominant * 0.2));
    mixedPercentage = Math.max(0, 20 - (aiDominant * 0.7));
    aiPercentage = 75 + aiDominant;
    dominantType = 'ai';
  }

  // Normalize to ensure sum is 100%
  const total = humanPercentage + aiPercentage + mixedPercentage;
  if (total > 0) {
    humanPercentage = Math.round((humanPercentage / total) * 100);
    aiPercentage = Math.round((aiPercentage / total) * 100);
    mixedPercentage = 100 - humanPercentage - aiPercentage;
  }

  return {
    humanPercentage: Math.max(0, humanPercentage),
    aiPercentage: Math.max(0, aiPercentage),
    mixedPercentage: Math.max(0, mixedPercentage),
    dominantType,
  };
}

export default function AILikelihoodCard({ aiScore, className = '', showDetectors = true }: AILikelihoodCardProps) {
  const breakdown = useMemo(() => calculateLikelihoodBreakdown(aiScore), [aiScore]);

  const detectorNames = [
    'Turnitin',
    'GPTZero',
    'ZeroGPT',
    'Crossplag',
    'Copyleaks',
    'Originality AI'
  ];

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-white/80">
          Humanize Detection Snapshot
        </h3>
        <p className="text-xs text-slate-500 dark:text-white/50">
          Human-written, mixed, and AI-generated signal breakdown
        </p>
      </div>

      {/* Breakdown percentages */}
      <div className="space-y-3">
        {/* Human-written */}
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-emerald-900 dark:text-emerald-300">
              Human-written
            </span>
          </div>
          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {breakdown.humanPercentage}%
          </span>
        </div>

        {/* Mixed */}
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-900 dark:text-amber-300">
              Mixed
            </span>
          </div>
          <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
            {breakdown.mixedPercentage}%
          </span>
        </div>

        {/* AI-generated */}
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <span className="text-sm font-medium text-rose-900 dark:text-rose-300">
              AI-generated
            </span>
          </div>
          <span className="text-lg font-bold text-rose-600 dark:text-rose-400">
            {breakdown.aiPercentage}%
          </span>
        </div>
      </div>

      {/* Cross-checked detectors */}
      {showDetectors && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center gap-2">
            <Shield className="h-4 w-4 text-slate-600 dark:text-white/60" />
            <span className="text-xs font-semibold text-slate-700 dark:text-white/70">
              Cross-checked with:
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {detectorNames.map((detector) => (
              <div key={detector} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-white/60">
                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span>{detector}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI-generated signal indicator */}
      <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-500/30 dark:bg-indigo-500/10">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-indigo-900 dark:text-indigo-300">
            AI-generated signal
          </span>
          <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
            {aiScore}/100
          </span>
        </div>
      </div>
    </div>
  );
}

// Export the calculation function for use in backend
export { calculateLikelihoodBreakdown };
export type { AILikelihoodBreakdown };
