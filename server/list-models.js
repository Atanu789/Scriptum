const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

function countKeys(prefix) {
  const values = new Set();

  const csv = process.env[`${prefix}_API_KEYS`];
  if (csv) {
    csv.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => values.add(v));
  }

  const single = process.env[`${prefix}_API_KEY`];
  if (single) values.add(single.trim());

  for (let i = 1; i <= 12; i += 1) {
    const key = process.env[`${prefix}_API_KEY_${i}`] || process.env[`${prefix}_API_KEY${i}`];
    if (key && key.trim()) values.add(key.trim());
  }

  return values.size;
}

function printPoolSummary() {
  const groqCount = countKeys('GROQ');
  const openRouterCount = countKeys('OPENROUTER');

  console.log('AI key pool summary');
  console.log(`- GROQ keys: ${groqCount}`);
  console.log(`- OPENROUTER keys: ${openRouterCount}`);
  console.log(`- Total keys: ${groqCount + openRouterCount}`);
}

printPoolSummary();
