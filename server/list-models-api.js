require('dotenv').config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Available models:');
      data.models.forEach(model => {
        if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent')) {
          console.log(`✓ ${model.name}`);
        }
      });
    } else {
      console.log('Failed:', response.status, await response.text());
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

listModels();
