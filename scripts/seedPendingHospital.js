import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import Hospital from '../models/Hospital.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hospitofind';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const hospital = await Hospital.create({
    name: 'E2E Pending Hospital',
    address: { city: 'Lagos', state: 'Nigeria' },
    type: 'General',
    services: ['general'],
    comments: [],
    hours: [],
    verified: false,
    isFeatured: false,
    longitude: 3.3792,
    latitude: 6.5244,
    location: { type: 'Point', coordinates: [3.3792, 6.5244] },
  });
  console.log(`Created pending hospital with id: ${hospital._id}`);
  await mongoose.disconnect();
}

seed().catch(console.error);
