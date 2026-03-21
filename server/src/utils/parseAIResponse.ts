export interface ParsedAIResponse {
  score: number;
  readability: string;
  grammarIssues: string[];
  suggestions: string[];
  improvedText: string;
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  const clamped = Math.max(0, Math.min(100, Math.round(n)));
  return clamped === 0 ? 1 : clamped;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function fallbackParsedAIResponse(): ParsedAIResponse {
  return {
    score: 50,
    readability: 'Fallback: invalid AI response',
    grammarIssues: [],
    suggestions: [],
    improvedText: '',
  };
}

export function parseAIResponse(text: string): ParsedAIResponse {
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

    const out = {
      score: clampScore(parsed.score),
      readability: typeof parsed.readability === 'string' && parsed.readability.trim()
        ? parsed.readability.trim()
        : 'Unknown',
      grammarIssues: toStringArray(parsed.grammarIssues),
      suggestions: toStringArray(parsed.suggestions),
      improvedText: typeof parsed.improvedText === 'string' ? parsed.improvedText.trim() : '',
    };

    if (!Number.isFinite(Number(parsed.score))) {
      return fallbackParsedAIResponse();
    }

    if (out.score === 0) {
      out.score = 50;
    }

    return out;
  } catch (err) {
    console.error('AI PARSE ERROR:', err, text);
    return fallbackParsedAIResponse();
  }
}