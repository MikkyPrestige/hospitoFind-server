import mongoose from 'mongoose';
import Hospital from '../models/Hospital.js';

const uri = process.env.MONGODB_URI;
const userId = process.env.USER_ID;

if (!uri || !userId) {
  console.error('MONGODB_URI and USER_ID are required');
  process.exit(1);
}

const seed = async () => {
  await mongoose.connect(uri);
  console.log('Connected to DB');

  const submissions = [];
  for (let i = 0; i < 25; i++) {
    submissions.push({
      name: `My Submission ${i + 1}`,
      address: {
        city: i % 2 === 0 ? 'Lagos' : 'Abuja',
        state: 'Nigeria',
      },
      type: 'General',
      verified: i % 3 === 0, // mix of approved/pending
      services: ['general'],
      comments: [],
      hours: [],
      createdBy: new mongoose.Types.ObjectId(userId),
    });
  }

  await Hospital.insertMany(submissions);
  console.log(`Inserted ${submissions.length} submissions for user ${userId}`);
  await mongoose.disconnect();
  console.log('Done');
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
