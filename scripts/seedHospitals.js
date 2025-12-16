import mongoose from "mongoose";
import dotenv from "dotenv";
import Hospital from "../models/hospitalsModel.js";
import hospitalsData from "../data/hospitals.json" assert { type: "json" };
import { sanitize } from "../config/sanitize.js";
import { getCoordinates } from "../config/geocode.js";

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is missing in .env");
  process.exit(1);
}

mongoose.connect(uri);

async function seed() {
  try {
    //  CLEAR COLLECTION
    console.log("Clearing old hospitals...");
    await Hospital.deleteMany({});
    console.log("Old hospitals deleted.\n");

    // VALIDATE JSON DATA
    console.log("Validating hospital data...");
    const invalid = hospitalsData.filter(
      (h) => !h.name || !h.address || !h.address.city || !h.address.state
    );

    if (invalid.length > 0) {
      console.warn(`Found ${invalid.length} invalid hospital entries.`);
      process.exit(1);
    }

    console.log(`Validated ${hospitalsData.length} hospitals.\n`);

    // CREATE SLUGS BEFORE INSERT
    console.log("Generating slugs...");
    const slugMap = new Set();

    const withSlugs = hospitalsData.map((h) => {
      const base = sanitize(h.name || "hospital");
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

    console.log("Slugs generated.\n");

    // INSERT FRESH DATA
    console.log("Importing hospitals...");
    await Hospital.insertMany(withSlugs, { ordered: false });
    console.log("Imported successfully.\n");

    // ADD COORDINATES IF MISSING
    console.log("Checking for hospitals missing coordinates...");

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
      const fullAddress = `${hospital.address.street || ""}, ${
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

    console.log("\n All done. DB is now fully synced.");
    mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  } catch (err) {
    console.error("Error:", err);
    mongoose.disconnect();
    process.exit(1);
  }
}

seed();

// import mongoose from "mongoose";
// import dotenv from "dotenv";
// import Hospital from "../models/hospitalsModel.js";
// import hospitalsData from "../data/hospitals.json" assert { type: "json" };
// import { getCoordinates } from "../config/geocode.js";

// dotenv.config();

// const uri = process.env.MONGODB_URI || process.env.MONGODB_URI;
// if (!uri) {
//   console.error("❌ MONGODB_URI is missing in your .env file");
//   process.exit(1);
// }

// mongoose.connect(uri);

// async function importHospitals() {
//   try {
//     console.log("🔍 Validating hospital data...");

//     // Validate required fields
//     const invalidHospitals = hospitalsData.filter(
//       (h) => !h.name || !h.address || !h.address.city || !h.address.state
//     );

//     if (invalidHospitals.length > 0) {
//       console.warn(`⚠️ Found ${invalidHospitals.length} invalid hospitals.`);
//       invalidHospitals.forEach((h, i) => {
//         console.warn(
//           `${i + 1}. Missing fields: ${!h.name ? "name " : ""}${
//             !h.address?.city ? "city " : ""
//           }${!h.address?.state ? "state " : ""}`
//         );
//       });
//       console.warn("🛑 Please fix these before seeding.\n");
//       process.exit(1);
//     }

//     console.log(
//       `✅ All ${hospitalsData.length} hospitals validated. Starting upsert...`
//     );

//     // Prepare bulk operations for upsert
//     const ops = hospitalsData.map((h) => ({
//       updateOne: {
//         filter: { name: h.name },
//         update: { $set: h },
//         upsert: true, // Insert if not found
//       },
//     }));

//     const BATCH_SIZE = 100;
//     let totalModified = 0;
//     let totalUpserted = 0;

//     for (let i = 0; i < ops.length; i += BATCH_SIZE) {
//       const batch = ops.slice(i, i + BATCH_SIZE);
//       const result = await Hospital.bulkWrite(batch, { ordered: false });

//       totalModified += result.modifiedCount || 0;
//       totalUpserted += result.upsertedCount || 0;

//       console.log(
//         `🧩 Processed ${Math.min(i + BATCH_SIZE, ops.length)} / ${
//           ops.length
//         } hospitals`
//       );
//     }

//     console.log("\n🎉 --- SEED SUMMARY ---");
//     console.log(`♻️ Updated existing hospitals: ${totalModified}`);
//     console.log(`🆕 Added new hospitals: ${totalUpserted}`);
//     console.log(`📦 Total processed: ${ops.length}`);
//     console.log("✅ Database successfully updated (no deletions).");

//     // === STEP 2: Add coordinates for new hospitals ===
//     console.log("\n📍 Checking for hospitals missing coordinates...");
//     const missingCoords = await Hospital.find({
//       $or: [
//         { longitude: { $exists: false } },
//         { latitude: { $exists: false } },
//         { longitude: null },
//         { latitude: null },
//       ],
//     });

//     if (missingCoords.length === 0) {
//       console.log("🎉 All hospitals already have valid coordinates.");
//     } else {
//       console.log(
//         `📍 Found ${missingCoords.length} hospitals missing coordinates.`
//       );

//       for (const hospital of missingCoords) {
//         const fullAddress = `${hospital.address.street || ""}, ${
//           hospital.address.city
//         }, ${hospital.address.state}`;
//         const { longitude, latitude } = await getCoordinates(fullAddress);

//         if (longitude && latitude) {
//           hospital.longitude = longitude;
//           hospital.latitude = latitude;
//           await hospital.save();
//           console.log(`✅ Added coordinates for ${hospital.name}`);
//         } else {
//           console.warn(`⚠️ Could not get coordinates for ${hospital.name}`);
//         }

//         // small delay to avoid Mapbox rate limits
//         await new Promise((r) => setTimeout(r, 400));
//       }
//     }

//     console.log("\n🎯 All done! Hospitals and coordinates fully synced.");
//     await mongoose.disconnect();
//     console.log("🔌 Disconnected from MongoDB.");
//   } catch (error) {
//     console.error("❌ Error seeding hospitals:", error);
//     await mongoose.disconnect();
//     process.exit(1);
//   }
// }

// importHospitals();
