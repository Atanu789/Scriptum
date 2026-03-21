export interface ParsedAIResponse {
  score: number;
  readability: string;
  grammarIssues: string[];
  suggestions: string[];
  improvedText: string;
}

function clampScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function parseAIResponse(text: string): ParsedAIResponse | null {
  try {
    if (!text || !text.trim()) {
      throw new Error('Empty AI response');
    }

    const cleaned = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('No JSON found');
    }

    const parsed = JSON.parse(match[0]) as {
      score?: unknown;
      readability?: unknown;
      grammarIssues?: unknown;
      suggestions?: unknown;
      improvedText?: unknown;
    };

    const score = clampScore(parsed.score);
    if (score === null) {
      throw new Error('Invalid numeric score');
    }

    const out: ParsedAIResponse = {
      score,
      readability: typeof parsed.readability === 'string' && parsed.readability.trim()
        ? parsed.readability.trim()
        : 'Unknown',
      grammarIssues: toStringArray(parsed.grammarIssues),
      suggestions: toStringArray(parsed.suggestions),
      improvedText: typeof parsed.improvedText === 'string' ? parsed.improvedText.trim() : '',
    };

    return out;
  } catch (err) {
    console.error('AI PARSE ERROR:', err, text);
    return null;
  }
}