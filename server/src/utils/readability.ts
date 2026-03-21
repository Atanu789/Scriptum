export function calculateReadability(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  const wordCount = Math.max(words.length, 1);
  const sentenceCount = Math.max(sentences.length, 1);
  const estimatedSyllables = wordCount * 1.5;

  const score =
    206.835 -
    1.015 * (wordCount / sentenceCount) -
    84.6 * (estimatedSyllables / wordCount);

  return Math.max(0, Math.min(100, Math.round(score)));
}