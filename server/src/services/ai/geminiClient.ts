import { GoogleGenerativeAI } from '@google/generative-ai';

let client: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

export async function callGemini(prompt: string): Promise<string> {
  const model = getGeminiClient().getGenerativeModel({ 
    model: 'gemini-2.5-flash'
  });
  
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return text.trim();
}
