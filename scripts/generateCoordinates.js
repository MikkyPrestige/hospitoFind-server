import mongoose from "mongoose";
import dotenv from "dotenv";
import Hospital from "../models/hospitalsModel.js";
import { getCoordinates } from "../config/geocode.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env");
  process.exit(1);
}

async function generateCoordinates() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    // Find hospitals missing or null coordinates
    const hospitals = await Hospital.find({
      $or: [
        { longitude: { $exists: false } },
        { latitude: { $exists: false } },
        { longitude: null },
        { latitude: null },
      ],
    });

    if (hospitals.length === 0) {
      console.log("All hospitals already have valid coordinates.");
      await mongoose.disconnect();
      return;
    }

    console.log(
      `Found ${hospitals.length} hospitals missing coordinates.\n`
    );

    let updated = 0;
    let failed = 0;

    for (const hospital of hospitals) {
      const fullAddress = `${hospital.address.street || ""}, ${
        hospital.address.city
      }, ${hospital.address.state}`.trim();

      const { longitude, latitude } = await getCoordinates(fullAddress);

      if (longitude && latitude) {
        hospital.longitude = longitude;
        hospital.latitude = latitude;
        await hospital.save();
        updated++;
        console.log(`Updated ${hospital.name}: [${longitude}, ${latitude}]`);
      } else {
        failed++;
        console.warn(`No coordinates found for ${hospital.name}`);
      }

      // Small delay to avoid Mapbox rate limits
      await new Promise((r) => setTimeout(r, 400));
    }

    // Summary
    const alreadyHadCoords =
      (await Hospital.countDocuments({
        longitude: { $exists: true },
        latitude: { $exists: true },
      })) - updated;

    console.log("\n--- SUMMARY ---");
    console.log(`Updated: ${updated}`);
    console.log(`⏭Skipped (already had coords): ${alreadyHadCoords}`);
    console.log(`Failed (no coordinates found): ${failed}`);
    console.log("------------------");
  } catch (err) {
    console.error("Error generating coordinates:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run the script
generateCoordinates();
