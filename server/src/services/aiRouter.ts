import { buildAICacheHash, getCachedAIResult, setCachedAIResult } from './aiCache';

export type AIProvider = 'groq' | 'openrouter';

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
  };
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  forceFresh?: boolean;
  validateResult?: (text: string) => boolean;
}

const PROVIDER_TIMEOUT_MS = 200_000;

const DEFAULT_GROQ_MODELS = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
const DEFAULT_OPENROUTER_FREE_MODELS = [
  'openrouter/auto',
];
const roundRobinCursor: Record<AIProvider, number> = {
  groq: 0,
  openrouter: 0,
};

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

function parseKeyPool(prefix: 'GROQ' | 'OPENROUTER'): string[] {
  const list: string[] = [];

  const csv = process.env[`${prefix}_API_KEYS`]?.trim() || '';
  if (csv) {
    list.push(...csv.split(',').map((v) => v.trim()).filter(Boolean));
  }

  const single = process.env[`${prefix}_API_KEY`]?.trim();
  if (single) list.push(single);

  for (let i = 1; i <= 12; i += 1) {
    const numbered = process.env[`${prefix}_API_KEY_${i}`]?.trim()
      || process.env[`${prefix}_API_KEY${i}`]?.trim();
    if (numbered) list.push(numbered);
  }

  return Array.from(new Set(list));
}

function getStartKeyIndex(provider: AIProvider, keyCount: number): number {
  if (keyCount <= 1) return 0;
  const start = Math.abs(roundRobinCursor[provider]) % keyCount;
  roundRobinCursor[provider] += 1;
  if (roundRobinCursor[provider] > Number.MAX_SAFE_INTEGER - 10_000) {
    roundRobinCursor[provider] = 0;
  }
  return start;
}

async function callGroq(params: RunAIParams): Promise<{ text: string; tokensUsed?: number }> {
  const keys = parseKeyPool('GROQ');
  const models = params.modelPreferences?.groq?.length ? params.modelPreferences.groq : DEFAULT_GROQ_MODELS;

  if (keys.length === 0) {
    throw new Error('GROQ_KEYS_MISSING');
  }

  const startKeyIndex = getStartKeyIndex('groq', keys.length);
  let lastErr: Error | null = null;

  for (let keyOffset = 0; keyOffset < keys.length; keyOffset += 1) {
    const key = keys[(startKeyIndex + keyOffset) % keys.length];

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
  const keys = parseKeyPool('OPENROUTER');
  const models = params.modelPreferences?.openrouter?.length
    ? params.modelPreferences.openrouter
    : DEFAULT_OPENROUTER_FREE_MODELS;

  if (keys.length === 0) {
    throw new Error('OPENROUTER_KEYS_MISSING');
  }

  if (models.length === 0) {
    throw new Error('OPENROUTER_FREE_MODELS_MISSING');
  }

  const startKeyIndex = getStartKeyIndex('openrouter', keys.length);
  let lastErr: Error | null = null;

  for (let keyOffset = 0; keyOffset < keys.length; keyOffset += 1) {
    const key = keys[(startKeyIndex + keyOffset) % keys.length];

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
  ];

  const providerErrors: string[] = [];

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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Provider call failed';
      providerErrors.push(`${step.provider}: ${message}`);
      // Try next provider in chain.
    }
  }

  return {
    success: false,
    message: providerErrors.length > 0
      ? `AI temporarily unavailable (${providerErrors.join(' | ')})`
      : 'AI temporarily unavailable',
    fallbackTried: true,
  };
}
