import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Hospital from '../models/hospitalsModel.js';
import { readFileSync } from 'fs';
const hospitalsData = JSON.parse(readFileSync(new URL('../data/hospitals.json', import.meta.url)));
import { sanitize } from '../config/sanitize.js';
import { getCoordinates } from '../config/geocode.js';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is missing in .env');
  process.exit(1);
}

mongoose.connect(uri);

async function seed() {
  try {
    console.log('Clearing old hospitals...');
    await Hospital.deleteMany({});
    console.log('Old hospitals deleted.\n');

    console.log('Validating hospital data...');
    const invalid = hospitalsData.filter(
      (h) => !h.name || !h.address || !h.address.city || !h.address.state,
    );

    if (invalid.length > 0) {
      console.warn(`Found ${invalid.length} invalid hospital entries.`);
      process.exit(1);
    }

    console.log(`Validated ${hospitalsData.length} hospitals.\n`);

    console.log('Generating slugs...');
    const slugMap = new Set();

    const withSlugs = hospitalsData.map((h) => {
      const base = sanitize(h.name || 'hospital');
      let slug = base;
      let i = 0;

      // Loop until unique slug found for city+state
      while (slugMap.has(`${h.address.state}-${h.address.city}-${slug}`)) {
        i++;
        slug = `${base}-${i}`;
      }

      slugMap.add(`${h.address.state}-${h.address.city}-${slug}`);

      return { ...h, slug };
    });

    console.log('Slugs generated.\n');

    // INSERT FRESH DATA
    console.log('Importing hospitals...');
    await Hospital.insertMany(withSlugs, { ordered: false });
    console.log('Imported successfully.\n');

    // ADD COORDINATES IF MISSING
    console.log('Checking for hospitals missing coordinates...');

    const missing = await Hospital.find({
      $or: [
        { longitude: { $exists: false } },
        { latitude: { $exists: false } },
        { longitude: null },
        { latitude: null },
      ],
    });

    console.log(`${missing.length} hospitals need coordinates.\n`);

    for (const hospital of missing) {
      const fullAddress = `${hospital.address.street || ''}, ${
        hospital.address.city
      }, ${hospital.address.state}`;
      const { longitude, latitude } = await getCoordinates(fullAddress);

      if (longitude && latitude) {
        hospital.longitude = longitude;
        hospital.latitude = latitude;
        await hospital.save();
        console.log(`Added coords → ${hospital.name}`);
      } else {
        console.log(`Could not locate → ${hospital.name}`);
      }

      await new Promise((r) => setTimeout(r, 350)); // rate-limit safety
    }

    console.log('\n All done. DB is now fully synced.');
    mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  } catch (err) {
    console.error('Error:', err);
    mongoose.disconnect();
    process.exit(1);
  }
}

seed();
