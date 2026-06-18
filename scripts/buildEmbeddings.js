import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { rebuildEmbeddings } from '../utils/rebuildEmbeddings.js';

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB – starting manual embeddings rebuild');
  await rebuildEmbeddings();
  await mongoose.disconnect();
  console.log('Disconnected – manual rebuild complete');
  process.exit(0);
};

run().catch((err) => {
  console.error('Manual rebuild failed:', err);
  process.exit(1);
});
