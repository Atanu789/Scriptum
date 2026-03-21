import axios from 'axios';

const TIMEOUT_MS = 20_000;
const MAX_INPUT_CHARS = 4_000;

type Provider = 'groq' | 'openrouter' | 'gemini' | 'fallback';

type AIEngineResponse = {
  provider: Provider;
  result: string | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function loadKeys(prefix: 'GROQ' | 'OPENROUTER'): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 4; i += 1) {
    const value = process.env[`${prefix}_API_KEY_${i}`]?.trim();
    if (value) keys.push(value);
  }
  return keys;
}

const GROQ_KEYS = loadKeys('GROQ');
const OPENROUTER_KEYS = loadKeys('OPENROUTER');

function normalizeInput(text: string): string {
  const cleaned = (text || '').trim();
  if (cleaned.length <= MAX_INPUT_CHARS) return cleaned;
  return cleaned.slice(0, MAX_INPUT_CHARS);
}

async function safeRequest(fn: () => Promise<string | null>, label: string): Promise<string | null> {
  try {
    const out = await fn();
    if (!isNonEmptyString(out)) {
      throw new Error('EMPTY_RESPONSE');
    }
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    console.error(`[AI Engine] ${label} failed: ${message}`);
    return null;
  }
}

async function groqCall(text: string): Promise<string | null> {
  for (let i = 0; i < GROQ_KEYS.length; i += 1) {
    const key = GROQ_KEYS[i];

    const result = await safeRequest(async () => {
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: text }],
          temperature: 0.2,
          max_tokens: 900,
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          timeout: TIMEOUT_MS,
        }
      );

      return res.data?.choices?.[0]?.message?.content ?? null;
    }, `Groq key ${i + 1}`);

    if (result) return result;
  }

  return null;
}

async function openRouterCall(text: string): Promise<string | null> {
  const models = ['openrouter/auto', 'openai/gpt-3.5-turbo'];

  for (let i = 0; i < OPENROUTER_KEYS.length; i += 1) {
    const key = OPENROUTER_KEYS[i];

    for (const model of models) {
      const result = await safeRequest(async () => {
        const res = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model,
            messages: [{ role: 'user', content: text }],
            temperature: 0.2,
            max_tokens: 900,
          },
          {
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            timeout: TIMEOUT_MS,
          }
        );

        return res.data?.choices?.[0]?.message?.content ?? null;
      }, `OpenRouter key ${i + 1} (${model})`);

      if (result) return result;
    }
  }

  return null;
}

async function geminiCall(text: string): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) return null;

  return safeRequest(async () => {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`,
      {
        contents: [{ parts: [{ text }] }],
      },
      {
        timeout: TIMEOUT_MS,
      }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }, 'Gemini');
}

export async function runAI(text: string): Promise<AIEngineResponse> {
  const input = normalizeInput(text);
  if (!input) {
    return { provider: 'fallback', result: null };
  }

  let result = await groqCall(input);
  if (result) return { provider: 'groq', result };

  result = await openRouterCall(input);
  if (result) return { provider: 'openrouter', result };

  result = await geminiCall(input);
  if (result) return { provider: 'gemini', result };

  console.error('[AI Engine] All providers failed');
  return { provider: 'fallback', result: null };
}
