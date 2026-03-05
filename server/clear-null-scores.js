const mongoose = require('mongoose');
require('dotenv').config();

async function clearNullScores() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const result = await mongoose.connection.db.collection('documents').updateMany(
      { aiScore: null },
      { 
        $set: { 
          aiScore: null,
          analysisRunAt: null,
          contentHash: null
        } 
      }
    );
    
    console.log(`Cleared analysis cache for ${result.modifiedCount} documents with null aiScore`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

clearNullScores();
