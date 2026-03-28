/**
 * AI Likelihood Breakdown Calculator
 * Converts AI score to human/mixed/AI percentages
 */

export interface AILikelihoodBreakdown {
  humanPercentage: number;
  aiPercentage: number;
  mixedPercentage: number;
  dominantType: 'human' | 'ai' | 'mixed';
}

/**
 * Calculate AI likelihood breakdown from AI score
 * - Low score (0-25): Mostly Human
 * - Medium score (26-60): Mixed
 * - High score (61-100): Mostly AI
 */
export function calculateAILikelihoodBreakdown(aiScore: number): AILikelihoodBreakdown {
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
