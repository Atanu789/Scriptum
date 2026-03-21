const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function testGroq() {
  const key = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY;
  if (!key) {
    console.log('Groq key missing');
    return;
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Say hello in one line.' }],
      temperature: 0,
      max_tokens: 30,
    }),
  });

  if (!response.ok) {
    console.log('Groq failed:', response.status, await response.text());
    return;
  }

  const data = await response.json();
  console.log('Groq ok:', data.choices?.[0]?.message?.content || 'no content');
}

async function testOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY_1 || process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.log('OpenRouter key missing');
    return;
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openrouter/auto',
      messages: [{ role: 'user', content: 'Say hello in one line.' }],
      temperature: 0,
      max_tokens: 30,
    }),
  });

  if (!response.ok) {
    console.log('OpenRouter failed:', response.status, await response.text());
    return;
  }

  const data = await response.json();
  console.log('OpenRouter ok:', data.choices?.[0]?.message?.content || 'no content');
}

async function main() {
  await testGroq();
  await testOpenRouter();
}

main();
