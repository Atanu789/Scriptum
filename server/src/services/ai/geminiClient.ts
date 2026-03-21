import { GoogleGenerativeAI } from '@google/generative-ai';

const clientByKey = new Map<string, GoogleGenerativeAI>();
let roundRobinIndex = 0;

export interface GeminiCallOptions {
  model?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  preferKeyIndex?: number;
}

function getGeminiKeys(): string[] {
  const list = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Backward-compatible support for GEMINI_API_KEY1..GEMINI_API_KEY10 style envs.
  for (let i = 1; i <= 10; i += 1) {
    const numbered = process.env[`GEMINI_API_KEY${i}`]?.trim();
    if (numbered) list.push(numbered);
  }

  const single = process.env.GEMINI_API_KEY?.trim();
  if (single) list.unshift(single);

  const unique = Array.from(new Set(list.filter(Boolean)));
  if (unique.length > 0) return unique;

  throw new Error('GEMINI_API_KEY (or GEMINI_API_KEYS) not configured');
}

function getClientForKey(apiKey: string): GoogleGenerativeAI {
  const cached = clientByKey.get(apiKey);
  if (cached) return cached;
  const created = new GoogleGenerativeAI(apiKey);
  clientByKey.set(apiKey, created);
  return created;
}

function pickApiKey(preferKeyIndex?: number): string {
  const keys = getGeminiKeys();
  if (keys.length === 1) return keys[0];

  if (typeof preferKeyIndex === 'number' && Number.isFinite(preferKeyIndex)) {
    const idx = Math.abs(Math.floor(preferKeyIndex)) % keys.length;
    return keys[idx];
  }

  const key = keys[roundRobinIndex % keys.length];
  roundRobinIndex += 1;
  return key;
}

function isRetryableGeminiError(err: unknown): boolean {
  const maybe = err as { status?: unknown; statusText?: unknown; message?: unknown };
  const status = Number(maybe?.status);
  if (status === 429 || status === 500 || status === 503) return true;

  const message = typeof maybe?.message === 'string' ? maybe.message.toLowerCase() : '';
  const statusText = typeof maybe?.statusText === 'string' ? maybe.statusText.toLowerCase() : '';
  return message.includes('quota') || message.includes('rate limit') || statusText.includes('too many requests');
}

export function getGeminiClient(): GoogleGenerativeAI {
  const key = pickApiKey();
  return getClientForKey(key);
}

export async function callGemini(prompt: string, options?: GeminiCallOptions): Promise<string> {
  const keys = getGeminiKeys();
  const startIndex = typeof options?.preferKeyIndex === 'number'
    ? Math.abs(Math.floor(options.preferKeyIndex)) % keys.length
    : Math.abs(roundRobinIndex++) % keys.length;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const key = keys[(startIndex + attempt) % keys.length];
    try {
      const model = getClientForKey(key).getGenerativeModel({
        model: options?.model || 'gemini-2.5-flash',
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options?.temperature,
          topP: options?.topP,
          maxOutputTokens: options?.maxOutputTokens,
        },
      });

      const text = result.response.text();
      return text.trim();
    } catch (err) {
      lastError = err;
      if (!isRetryableGeminiError(err)) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All Gemini keys failed');
}
