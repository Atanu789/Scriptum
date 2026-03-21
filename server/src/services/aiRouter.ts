import { callGemini } from './ai/geminiClient';
import { buildAICacheHash, getCachedAIResult, setCachedAIResult } from './aiCache';

export type AIProvider = 'groq' | 'openrouter' | 'gemini';

export interface AIResponse {
  success: boolean;
  text?: string;
  provider?: AIProvider;
  tokensUsed?: number;
  cached?: boolean;
  message?: string;
  fallbackTried?: boolean;
}

export interface RunAIParams {
  prompt: string;
  modelPreferences?: {
    groq?: string[];
    openrouter?: string[];
    gemini?: string[];
  };
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  forceFresh?: boolean;
  validateResult?: (text: string) => boolean;
}

const PROVIDER_TIMEOUT_MS = 8_000;

const DEFAULT_GROQ_MODELS = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
const DEFAULT_OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
];
const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash'];

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs);
  });

  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function isRetryableProviderError(status: number, message: string): boolean {
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  const lower = message.toLowerCase();
  return lower.includes('timeout') || lower.includes('rate limit') || lower.includes('quota');
}

function parseKeyPool(primaryKey?: string, secondaryKey?: string): string[] {
  return [primaryKey, secondaryKey].map((v) => (v || '').trim()).filter(Boolean);
}

async function callGroq(params: RunAIParams): Promise<{ text: string; tokensUsed?: number }> {
  const keys = parseKeyPool(process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2);
  const models = params.modelPreferences?.groq?.length ? params.modelPreferences.groq : DEFAULT_GROQ_MODELS;

  if (keys.length === 0) {
    throw new Error('GROQ_KEYS_MISSING');
  }

  let lastErr: Error | null = null;

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex];

    for (const model of models) {
      try {
        const response = await withTimeout(
          fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: params.prompt }],
              temperature: params.temperature ?? 0.3,
              max_tokens: params.maxTokens ?? 900,
            }),
          }),
          PROVIDER_TIMEOUT_MS
        );

        const payload = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
          error?: { message?: string };
        };

        if (!response.ok) {
          const msg = payload.error?.message || `Groq HTTP ${response.status}`;
          if (isRetryableProviderError(response.status, msg)) {
            lastErr = new Error(msg);
            continue;
          }
          throw new Error(msg);
        }

        const text = (payload.choices?.[0]?.message?.content || '').trim();
        if (!text) {
          lastErr = new Error('GROQ_EMPTY_RESPONSE');
          continue;
        }

        return { text, tokensUsed: payload.usage?.total_tokens };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Groq call failed';
        if (isRetryableProviderError(429, message)) {
          lastErr = new Error(message);
          continue;
        }
        throw err instanceof Error ? err : new Error('Groq call failed');
      }
    }
  }

  throw lastErr || new Error('Groq fallback pool exhausted');
}

async function callOpenRouter(params: RunAIParams): Promise<{ text: string; tokensUsed?: number }> {
  const keys = parseKeyPool(process.env.OPENROUTER_API_KEY_1 || process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_API_KEY_2);
  const models = params.modelPreferences?.openrouter?.length
    ? params.modelPreferences.openrouter.filter((m) => m.includes(':free'))
    : DEFAULT_OPENROUTER_FREE_MODELS;

  if (keys.length === 0) {
    throw new Error('OPENROUTER_KEYS_MISSING');
  }

  if (models.length === 0) {
    throw new Error('OPENROUTER_FREE_MODELS_MISSING');
  }

  let lastErr: Error | null = null;

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex];

    for (const model of models) {
      try {
        const response = await withTimeout(
          fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: params.prompt }],
              temperature: params.temperature ?? 0.3,
              max_tokens: params.maxTokens ?? 900,
            }),
          }),
          PROVIDER_TIMEOUT_MS
        );

        const payload = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
          error?: { message?: string };
        };

        if (!response.ok) {
          const msg = payload.error?.message || `OpenRouter HTTP ${response.status}`;
          if (isRetryableProviderError(response.status, msg)) {
            lastErr = new Error(msg);
            continue;
          }
          throw new Error(msg);
        }

        const text = (payload.choices?.[0]?.message?.content || '').trim();
        if (!text) {
          lastErr = new Error('OPENROUTER_EMPTY_RESPONSE');
          continue;
        }

        return { text, tokensUsed: payload.usage?.total_tokens };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OpenRouter call failed';
        if (isRetryableProviderError(429, message)) {
          lastErr = new Error(message);
          continue;
        }
        throw err instanceof Error ? err : new Error('OpenRouter call failed');
      }
    }
  }

  throw lastErr || new Error('OpenRouter fallback pool exhausted');
}

async function callGeminiFallback(params: RunAIParams): Promise<{ text: string; tokensUsed?: number }> {
  const models = params.modelPreferences?.gemini?.length ? params.modelPreferences.gemini : DEFAULT_GEMINI_MODELS;
  let lastErr: Error | null = null;

  for (const model of models) {
    try {
      const text = await withTimeout(
        callGemini(params.prompt, {
          model,
          temperature: params.temperature ?? 0.3,
          maxOutputTokens: params.maxTokens ?? 900,
        }),
        PROVIDER_TIMEOUT_MS
      );

      const cleaned = (text || '').trim();
      if (!cleaned) {
        lastErr = new Error('GEMINI_EMPTY_RESPONSE');
        continue;
      }

      return { text: cleaned };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error('Gemini failed');
    }
  }

  throw lastErr || new Error('Gemini fallback exhausted');
}

export async function runAI({
  prompt,
  modelPreferences,
  temperature,
  maxTokens,
  userId,
  forceFresh = false,
  validateResult,
}: RunAIParams): Promise<AIResponse> {
  const cleanedPrompt = (prompt || '').trim();
  if (!cleanedPrompt) {
    return { success: false, message: 'AI temporarily unavailable', fallbackTried: true };
  }

  const hash = buildAICacheHash({ prompt: cleanedPrompt, modelPreferences, temperature, maxTokens });

  if (!forceFresh) {
    const cached = await getCachedAIResult<AIResponse>(hash);
    if (cached?.success && cached.text && (!validateResult || validateResult(cached.text))) {
      return {
        ...cached,
        cached: true,
      };
    }
  }

  const providerChain: Array<{ provider: AIProvider; run: () => Promise<{ text: string; tokensUsed?: number }> }> = [
    { provider: 'groq', run: () => callGroq({ prompt: cleanedPrompt, modelPreferences, temperature, maxTokens, userId, forceFresh }) },
    { provider: 'openrouter', run: () => callOpenRouter({ prompt: cleanedPrompt, modelPreferences, temperature, maxTokens, userId, forceFresh }) },
    { provider: 'gemini', run: () => callGeminiFallback({ prompt: cleanedPrompt, modelPreferences, temperature, maxTokens, userId, forceFresh }) },
  ];

  for (const step of providerChain) {
    try {
      const out = await step.run();
      const normalized: AIResponse = {
        success: true,
        text: out.text,
        provider: step.provider,
        tokensUsed: out.tokensUsed,
        cached: false,
      };

      if (!validateResult || validateResult(normalized.text || '')) {
        await setCachedAIResult(hash, normalized, 24);
      }
      return normalized;
    } catch {
      // Try next provider in chain.
    }
  }

  return {
    success: false,
    message: 'AI temporarily unavailable',
    fallbackTried: true,
  };
}
