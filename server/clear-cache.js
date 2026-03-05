require('dotenv').config();
const mongoose = require('mongoose');

async function clearNullScores() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const result = await mongoose.connection.db.collection('documents').updateMany(
    {},
    { 
      $set: { 
        aiScore: null,
        contentHash: null,
        analysisRunAt: null,
        status: 'pending'
      } 
    }
  );
  
  console.log(`✓ Reset ${result.modifiedCount} documents`);
  await mongoose.disconnect();
}

clearNullScores();
