import { callGemini } from './geminiClient';

interface AIScoreResult {
  aiScore: number | null;
  aiReasoning: string;
  humanizationTips: string[];
  humanizationSuggestions: Array<{ original: string; suggestion: string; reason: string }>;
}

function extractJSON(text: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  return JSON.parse(jsonMatch[0]);
}

export async function analyzeAIScore(text: string): Promise<AIScoreResult> {
  const sample = text.slice(0, 3000);

  const prompt = `You are an expert editorial assistant and AI-detection specialist.
Analyze the text below for AI-generated patterns.

Return ONLY a valid JSON object matching this exact schema — no markdown, no explanation, just JSON:
{
  "aiScore": <integer 0–100>,
  "aiReasoning": "<2-3 sentence explanation of the score>",
  "humanizationTips": ["<general tip 1>", "<general tip 2>", "<general tip 3>"],
  "humanizationSuggestions": [
    {
      "original": "<exact verbatim sentence or short phrase from the text that sounds AI-generated>",
      "suggestion": "<a rewritten, naturally human version of that sentence/phrase>",
      "reason": "<one-sentence explanation of what makes the original sound AI-generated and how the suggestion fixes it>"
    }
  ]
}

Rules for humanizationSuggestions:
- Include 3 to 6 items, chosen from the passages that scored highest for AI-patterns.
- "original" MUST be a verbatim excerpt from the provided text (max 80 words).
- "suggestion" should sound natural, specific and conversational — not generic.
- If aiScore < 20, you may return an empty array for humanizationSuggestions.

Text to analyze:
${sample}`;

  try {
    const response = await callGemini(prompt);
    const data = extractJSON(response);
    
    const score = typeof data.aiScore === 'number' ? Math.round(Math.max(0, Math.min(100, data.aiScore))) : null;
    
    const suggestions: AIScoreResult['humanizationSuggestions'] = Array.isArray(data.humanizationSuggestions)
      ? data.humanizationSuggestions
          .filter((s: any) => s && typeof s.original === 'string' && typeof s.suggestion === 'string')
          .slice(0, 6)
          .map((s: any) => ({
            original:   String(s.original).trim(),
            suggestion: String(s.suggestion).trim(),
            reason:     String(s.reason ?? '').trim(),
          }))
      : [];

    return {
      aiScore: score,
      aiReasoning: data.aiReasoning || 'Analysis complete',
      humanizationTips: Array.isArray(data.humanizationTips) ? data.humanizationTips.slice(0, 5) : [],
      humanizationSuggestions: suggestions,
    };
  } catch (err) {
    console.error('[AI Score] Error:', err);
    return {
      aiScore: null,
      aiReasoning: 'AI analysis failed',
      humanizationTips: [],
      humanizationSuggestions: [],
    };
  }
}

export async function humanizeTextContent(text: string): Promise<string> {
  const sample = text.slice(0, 12_000);

  const prompt = `You are a senior editor. Rewrite the text below so it reads more naturally human-written.

Goals:
- Keep the original meaning and key facts.
- Vary sentence structure and rhythm.
- Reduce repetitive phrasing and predictable transitions.
- Use natural, specific phrasing.
- Keep paragraph breaks.

Rules:
- Return ONLY the rewritten text.
- No markdown fences.
- No explanations.

Text:
${sample}`;

  const response = await callGemini(prompt);
  return response
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/i, '')
    .trim();
}
