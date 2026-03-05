function estimateSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  const vowels = word.match(/[aeiouy]+/g);
  return vowels ? vowels.length : 1;
}

function fleschGrade(score: number): string {
  if (score >= 90) return 'Very Easy (5th grade)';
  if (score >= 80) return 'Easy (6th grade)';
  if (score >= 70) return 'Fairly Easy (7th grade)';
  if (score >= 60) return 'Standard (8th–9th grade)';
  if (score >= 50) return 'Fairly Difficult (10th–12th grade)';
  if (score >= 30) return 'Difficult (College)';
  return 'Very Confusing (Professional)';
}

export function analyzeReadability(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  
  const wordCount = words.length;
  const sentenceCount = Math.max(sentences.length, 1);
  const avgSentenceLength = Math.round((wordCount / sentenceCount) * 10) / 10;
  const readingTimeMinutes = Math.round((wordCount / 238) * 100) / 100;
  
  const avgSyllables = words.reduce((sum, w) => sum + estimateSyllables(w), 0) / Math.max(wordCount, 1);
  let score = Math.round(206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllables);
  score = Math.min(100, Math.max(0, score));
  
  return {
    score,
    wordCount,
    sentenceCount,
    readingTimeMinutes,
    fleschGradeLevel: fleschGrade(score),
    avgSentenceLength
  };
}

export function detectLongSentences(text: string, threshold = 30): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  return sentences
    .filter(s => s.trim().split(/\s+/).filter(Boolean).length > threshold)
    .slice(0, 20);
}
