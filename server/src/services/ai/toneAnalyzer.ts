import { callGemini } from './geminiClient';
import { ToneResult } from '../../types';

function extractJSON(text: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found');
  return JSON.parse(jsonMatch[0]);
}

export async function analyzeTone(text: string): Promise<ToneResult> {
  const sample = text.slice(0, 3000);
  
  const prompt = `Analyze the tone of this text. Respond with ONLY a JSON object:
{
  "dominantTone": "<formal|conversational|persuasive|technical|narrative|instructional>",
  "confidence": <0.0-1.0>,
  "breakdown": {"formal": 0.5, "conversational": 0.3, "persuasive": 0.1, "technical": 0.05, "narrative": 0.03, "instructional": 0.02},
  "biasFlags": ["<any detected bias>"]
}

Text:
${sample}`;

  try {
    const response = await callGemini(prompt);
    const data = extractJSON(response);
    
    return {
      dominantTone: data.dominantTone || 'neutral',
      confidence: Math.min(1, Math.max(0, data.confidence || 0.5)),
      breakdown: data.breakdown || { neutral: 1.0 },
      biasFlags: Array.isArray(data.biasFlags) ? data.biasFlags.slice(0, 5) : []
    };
  } catch (err) {
    console.error('[Tone] Error:', err);
    return {
      dominantTone: 'neutral',
      confidence: 0.5,
      breakdown: { neutral: 1.0 },
      biasFlags: []
    };
  }
}
