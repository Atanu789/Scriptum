require('dotenv').config();
const { analyzeAIScore } = require('./dist/services/ai/aiScoreAnalyzer');

const testText = `
Artificial intelligence has revolutionized the way we approach problem-solving in modern technology. 
Machine learning algorithms can process vast amounts of data with unprecedented efficiency. 
These systems utilize neural networks to identify patterns and make predictions based on historical information.
The implementation of AI in various industries has led to significant improvements in productivity and accuracy.
`;

async function test() {
  console.log('Testing AI Score Analysis...\n');
  console.log('Text:', testText.trim());
  console.log('\n---\n');
  
  try {
    const result = await analyzeAIScore(testText);
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result.aiScore !== null) {
      console.log('\n✓ SUCCESS: AI Score is', result.aiScore);
    } else {
      console.log('\n✗ FAILED: AI Score is null');
    }
  } catch (err) {
    console.error('✗ ERROR:', err.message);
  }
}

test();
