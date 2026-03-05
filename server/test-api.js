require('dotenv').config();

async function testAPI() {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];
  
  for (const modelName of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say hello' }] }]
        })
      });
      
      if (response.ok) {
        console.log(`✓ ${modelName} works!`);
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
        break;
      } else {
        console.log(`✗ ${modelName} failed: ${response.status}`);
      }
    } catch (err) {
      console.log(`✗ ${modelName} error:`, err.message);
    }
  }
}

testAPI();
