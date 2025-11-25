import mongoose from "mongoose";
import dotenv from "dotenv";
import Hospital from "../models/hospitalsModel.js";
import hospitalsData from "../data/hospitals.json" assert { type: "json" };
import { getCoordinates } from "../config/geocode.js";

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MongoDB_URI;
if (!uri) {
  console.error("❌ MONGODB_URI is missing in your .env file");
  process.exit(1);
}

mongoose.connect(uri);

async function importHospitals() {
  try {
    console.log("🔍 Validating hospital data...");

    // Validate required fields
    const invalidHospitals = hospitalsData.filter(
      (h) => !h.name || !h.address || !h.address.city || !h.address.state
    );

    if (invalidHospitals.length > 0) {
      console.warn(`⚠️ Found ${invalidHospitals.length} invalid hospitals.`);
      invalidHospitals.forEach((h, i) => {
        console.warn(
          `${i + 1}. Missing fields: ${!h.name ? "name " : ""}${
            !h.address?.city ? "city " : ""
          }${!h.address?.state ? "state " : ""}`
        );
      });
      console.warn("🛑 Please fix these before seeding.\n");
      process.exit(1);
    }

    console.log(
      `✅ All ${hospitalsData.length} hospitals validated. Starting upsert...`
    );

    // Prepare bulk operations for upsert
    const ops = hospitalsData.map((h) => ({
      updateOne: {
        filter: { name: h.name },
        update: { $set: h },
        upsert: true, // Insert if not found
      },
    }));

    const BATCH_SIZE = 100;
    let totalModified = 0;
    let totalUpserted = 0;

    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const batch = ops.slice(i, i + BATCH_SIZE);
      const result = await Hospital.bulkWrite(batch, { ordered: false });

      totalModified += result.modifiedCount || 0;
      totalUpserted += result.upsertedCount || 0;

      console.log(
        `🧩 Processed ${Math.min(i + BATCH_SIZE, ops.length)} / ${
          ops.length
        } hospitals`
      );
    }

    console.log("\n🎉 --- SEED SUMMARY ---");
    console.log(`♻️ Updated existing hospitals: ${totalModified}`);
    console.log(`🆕 Added new hospitals: ${totalUpserted}`);
    console.log(`📦 Total processed: ${ops.length}`);
    console.log("✅ Database successfully updated (no deletions).");

    // === STEP 2: Add coordinates for new hospitals ===
    console.log("\n📍 Checking for hospitals missing coordinates...");
    const missingCoords = await Hospital.find({
      $or: [
        { longitude: { $exists: false } },
        { latitude: { $exists: false } },
        { longitude: null },
        { latitude: null },
      ],
    });

    if (missingCoords.length === 0) {
      console.log("🎉 All hospitals already have valid coordinates.");
    } else {
      console.log(
        `📍 Found ${missingCoords.length} hospitals missing coordinates.`
      );

      for (const hospital of missingCoords) {
        const fullAddress = `${hospital.address.street || ""}, ${
          hospital.address.city
        }, ${hospital.address.state}`;
        const { longitude, latitude } = await getCoordinates(fullAddress);

        if (longitude && latitude) {
          hospital.longitude = longitude;
          hospital.latitude = latitude;
          await hospital.save();
          console.log(`✅ Added coordinates for ${hospital.name}`);
        } else {
          console.warn(`⚠️ Could not get coordinates for ${hospital.name}`);
        }

        // small delay to avoid Mapbox rate limits
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    console.log("\n🎯 All done! Hospitals and coordinates fully synced.");
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
  } catch (error) {
    console.error("❌ Error seeding hospitals:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

importHospitals();

// import mongoose from "mongoose";
// import dotenv from "dotenv";
// import fs from "fs";
// import path from "path";
// import Hospital from "./models/hospitalsModel.js";
// import hospitalsData from "./data/hospitals.json" assert { type: "json" };

// dotenv.config();

// const uri = process.env.MongoDB_URI;
// if (!uri) {
//   console.error("❌ MONGO_URI is missing in your .env file");
//   process.exit(1);
// }

// mongoose.connect(uri);

// async function importHospitals() {
//   try {
//     console.log("🔍 Checking hospital data integrity...");

//     // Check for missing required fields
//     const invalidHospitals = hospitalsData.filter(
//       (h) => !h.name || !h.address || !h.address.city || !h.address.state
//     );

//     if (invalidHospitals.length > 0) {
//       console.warn(
//         `⚠️ Found ${invalidHospitals.length} hospitals missing required fields:`
//       );
//       invalidHospitals.forEach((h, i) => {
//         console.warn(
//           `${i + 1}. Missing fields: ${!h.name ? "name " : ""}${
//             !h.address?.city ? "city " : ""
//           }${!h.address?.state ? "state " : ""}`
//         );
//         console.warn("→", h);
//       });
//       console.warn("\n🛑 Please fix these entries before seeding.\n");
//       process.exit(1);
//     }

//     console.log("✅ All hospitals have required fields. Proceeding...");

//     // Clear old data
//     await Hospital.deleteMany();

//     // Insert hospitals — continue on errors
//     const results = await Hospital.insertMany(hospitalsData, {
//       ordered: false,
//       rawResult: true,
//     });

//     const failedHospitals = [];

//     console.log(`✅ Successfully inserted ${results.insertedCount} hospitals.`);

//     // Handle failed inserts
//     if (results.writeErrors && results.writeErrors.length > 0) {
//       console.warn(
//         `⚠️ ${results.writeErrors.length} hospitals failed to insert due to validation or duplicates.`
//       );

//       results.writeErrors.forEach((err, i) => {
//         const doc = err.err.op || {};
//         console.warn(`\n${i + 1}. ❌ Failed hospital:`);
//         console.warn(`   → Name: ${doc.name || "Unknown"}`);
//         console.warn(`   → City: ${doc.address?.city || "N/A"}`);
//         console.warn(`   → State: ${doc.address?.state || "N/A"}`);
//         console.warn(`   → Reason: ${err.err.errmsg || err.err.message}`);
//         failedHospitals.push(doc);
//       });

//       // Save failed hospitals to local file
//       const failedPath = path.join(process.cwd(), "failed_hospitals.json");
//       fs.writeFileSync(
//         failedPath,
//         JSON.stringify(failedHospitals, null, 2),
//         "utf-8"
//       );

//       console.log(`\n💾 Saved ${failedHospitals.length} failed hospitals to:`);
//       console.log(failedPath);
//     }

//     console.log("🎉 Upload process completed!");
//     process.exit();
//   } catch (error) {
//     console.error("❌ Error uploading hospitals:", error);
//     process.exit(1);
//   }
// }

// importHospitals();
