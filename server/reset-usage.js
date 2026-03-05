const { MongoClient } = require('mongodb');

async function resetUsage() {
  const client = new MongoClient('mongodb://localhost:27017/scriptum');
  await client.connect();
  const db = client.db('scriptum');
  const result = await db.collection('usages').deleteMany({});
  console.log(`Deleted ${result.deletedCount} usage records`);
  await client.close();
}

resetUsage().catch(console.error);
