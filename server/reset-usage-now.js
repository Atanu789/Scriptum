const mongoose = require('mongoose');
require('dotenv').config();

async function resetUsage() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const result = await mongoose.connection.db.collection('usages').updateMany(
      {},
      { 
        $set: { 
          geminiCallsThisHour: 0,
          lastResetAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
        } 
      }
    );
    
    console.log(`Reset ${result.modifiedCount} usage records`);
    
    // Show current state
    const usages = await mongoose.connection.db.collection('usages').find({}).toArray();
    console.log('\nCurrent usage records:');
    usages.forEach(u => {
      console.log(`  User ${u.userId}: ${u.geminiCallsThisHour} calls, last reset: ${u.lastResetAt}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

resetUsage();
