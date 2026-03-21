require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const docs = await mongoose.connection.db
    .collection('documents')
    .aggregate([
      { $sample: { size: 1 } },
      { $project: { _id: 1, originalFileName: 1 } },
    ])
    .toArray();

  if (!docs.length) {
    console.log('NO_DOCS');
  } else {
    console.log(String(docs[0]._id));
    console.log(docs[0].originalFileName || '');
  }

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
