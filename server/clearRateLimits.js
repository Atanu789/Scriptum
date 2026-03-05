const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/scriptum')
  .then(async () => {
    console.log('Connected to MongoDB');
    await mongoose.connection.db.collection('usages').deleteMany({});
    console.log('Rate limits cleared');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
