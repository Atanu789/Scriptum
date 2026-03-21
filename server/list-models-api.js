const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function listGroqModels() {
  const apiKey = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log('Missing GROQ key');
    return;
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Groq models:');
      (data.data || []).forEach((model) => console.log(`- ${model.id}`));
    } else {
      console.log('Groq failed:', response.status, await response.text());
    }
  } catch (err) {
    console.log('Groq error:', err.message);
  }
}

async function listOpenRouterModels() {
  const apiKey = process.env.OPENROUTER_API_KEY_1 || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log('Missing OPENROUTER key');
    return;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('OpenRouter models (sample):');
      (data.data || []).slice(0, 20).forEach((model) => console.log(`- ${model.id}`));
    } else {
      console.log('OpenRouter failed:', response.status, await response.text());
    }
  } catch (err) {
    console.log('OpenRouter error:', err.message);
  }
}

async function main() {
  await listGroqModels();
  await listOpenRouterModels();
}

main();
