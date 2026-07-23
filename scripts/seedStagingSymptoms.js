import mongoose from 'mongoose';
import SymptomMapping from '../models/SymptomMapping.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

const generateMappings = (count = 25) => {
  const mappings = [];
  for (let i = 0; i < count; i++) {
    mappings.push({
      symptomKeywords: [`symptom${i}`, `keyword${i}`],
      services: [`service${i}`, `treatment${i}`],
    });
  }
  return mappings;
};

const seed = async () => {
  try {
    await mongoose.connect(uri);
    console.log('Connected to DB');
    const mappings = generateMappings(25);
    await SymptomMapping.insertMany(mappings);
    console.log(`Inserted ${mappings.length} symptom mappings`);
    await mongoose.disconnect();
    console.log('Done');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
};

seed();
