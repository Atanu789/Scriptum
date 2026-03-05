import { callGemini } from './geminiClient';

interface AIScoreResult {
  aiScore: number | null;
  aiReasoning: string;
  humanizationTips: string[];
}

function extractJSON(text: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  return JSON.parse(jsonMatch[0]);
}

export async function analyzeAIScore(text: string): Promise<AIScoreResult> {
  const sample = text.slice(0, 3000);
  
  const prompt = `You are an AI detection expert. Analyze this text and determine if it's AI-generated.

Provide your response as JSON with this exact structure:
{
  "aiScore": <number between 0-100>,
  "aiReasoning": "<brief explanation>",
  "humanizationTips": ["<tip1>", "<tip2>", "<tip3>"]
}

Where aiScore: 0 = definitely human-written, 100 = definitely AI-generated

Text to analyze:
${sample}

Respond with ONLY the JSON object, no other text.`;

  try {
    const response = await callGemini(prompt);
    const data = extractJSON(response);
    
    const score = typeof data.aiScore === 'number' ? Math.round(Math.max(0, Math.min(100, data.aiScore))) : null;
    
    return {
      aiScore: score,
      aiReasoning: data.aiReasoning || 'Analysis complete',
      humanizationTips: Array.isArray(data.humanizationTips) ? data.humanizationTips.slice(0, 5) : []
    };
  } catch (err) {
    console.error('[AI Score] Error:', err);
    return {
      aiScore: null,
      aiReasoning: 'AI analysis failed',
      humanizationTips: []
    };
  }
}
