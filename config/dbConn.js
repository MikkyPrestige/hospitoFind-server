import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Hospital from '../models/Hospital.js';
import { buildDictionary } from '../utils/spellCorrector.js';

// Connect to the database
const connectDB = asyncHandler(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB Connected');

  try {
    const termCount = await buildDictionary(Hospital);
    console.log(`Spelling dictionary built with ${termCount} terms`);
  } catch (err) {
    console.error('Failed to build spelling dictionary:', err);
  }
});

export default connectDB;
