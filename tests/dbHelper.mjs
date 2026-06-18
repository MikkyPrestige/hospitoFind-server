import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

const TEST_DB_URI = (() => {
  const base = process.env.MONGODB_URI;
  if (!base) return 'mongodb://127.0.0.1:27017/hospitofind-test';
  try {
    const url = new URL(base);
    url.pathname = '/hospitofind-test';
    return url.toString();
  } catch {
    return base + '-test';
  }
})();

export const connectTestDB = async () => {
  await mongoose.connect(TEST_DB_URI);
  await new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    const timeout = setTimeout(() => reject(new Error('DB connection timeout')), 15000);
    mongoose.connection.once('connected', () => {
      clearTimeout(timeout);
      resolve();
    });
    mongoose.connection.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
};

export const disconnectTestDB = async () => {
  await mongoose.disconnect();
};

export const clearTestDB = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};
