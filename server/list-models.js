require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    const models = await genAI.listModels();
    console.log('Available Gemini models:');
    for await (const model of models) {
      console.log(`- ${model.name}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

listModels();
