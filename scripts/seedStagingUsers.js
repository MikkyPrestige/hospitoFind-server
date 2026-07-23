import mongoose from 'mongoose';
// import bcrypt from 'bcrypt';
import User from '../models/User.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

const generateFakeUsers = (count = 25) => {
  const users = [];
  for (let i = 0; i < count; i++) {
    const suffix = Date.now() + i;
    users.push({
      name: `Test User ${i + 1}`,
      username: `testuser${suffix}`,
      email: `testuser${suffix}@example.com`,
      password: 'password123', // plaintext, the pre‑save hook will hash it
      role: i % 5 === 0 ? 'admin' : 'user',
      isActive: i % 7 !== 0, // some suspended for realism
      isVerified: true,
    });
  }
  return users;
};

const seed = async () => {
  try {
    await mongoose.connect(uri);
    console.log('Connected to database');

    const users = generateFakeUsers(25);
    // Use User.create to trigger pre‑save hooks (password hashing)
    await User.create(users);
    console.log(`Inserted ${users.length} users`);

    await mongoose.disconnect();
    console.log('Done');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
};

seed();
