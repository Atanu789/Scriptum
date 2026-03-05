import { callGemini } from './geminiClient';

function extractJSON(text: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found');
  return JSON.parse(jsonMatch[0]);
}

export async function detectClaims(text: string): Promise<string[]> {
  const sample = text.slice(0, 3000);
  
  const prompt = `Identify claims that need fact-checking or verification. Respond with ONLY a JSON object:
{
  "claimFlags": ["<claim sentence 1>", "<claim sentence 2>"]
}

Text:
${sample}`;

  try {
    const response = await callGemini(prompt);
    const data = extractJSON(response);
    return Array.isArray(data.claimFlags) ? data.claimFlags.slice(0, 10) : [];
  } catch (err) {
    console.error('[Claims] Error:', err);
    return [];
  }
}
