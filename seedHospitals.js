import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import Hospital from "./models/hospitalsModel.js";
import hospitalsData from "./data/hospitals.json" assert { type: "json" };

dotenv.config();

const uri = process.env.MongoDB_URI;
if (!uri) {
  console.error("❌ MONGO_URI is missing in your .env file");
  process.exit(1);
}

mongoose.connect(uri);

async function importHospitals() {
  try {
    console.log("🔍 Checking hospital data integrity...");

    // Check for missing required fields
    const invalidHospitals = hospitalsData.filter(
      (h) => !h.name || !h.address || !h.address.city || !h.address.state
    );

    if (invalidHospitals.length > 0) {
      console.warn(
        `⚠️ Found ${invalidHospitals.length} hospitals missing required fields:`
      );
      invalidHospitals.forEach((h, i) => {
        console.warn(
          `${i + 1}. Missing fields: ${!h.name ? "name " : ""}${
            !h.address?.city ? "city " : ""
          }${!h.address?.state ? "state " : ""}`
        );
        console.warn("→", h);
      });
      console.warn("\n🛑 Please fix these entries before seeding.\n");
      process.exit(1);
    }

    console.log("✅ All hospitals have required fields. Proceeding...");

    // Clear old data
    await Hospital.deleteMany();

    // Insert hospitals — continue on errors
    const results = await Hospital.insertMany(hospitalsData, {
      ordered: false,
      rawResult: true,
    });

    const failedHospitals = [];

    console.log(`✅ Successfully inserted ${results.insertedCount} hospitals.`);

    // Handle failed inserts
    if (results.writeErrors && results.writeErrors.length > 0) {
      console.warn(
        `⚠️ ${results.writeErrors.length} hospitals failed to insert due to validation or duplicates.`
      );

      results.writeErrors.forEach((err, i) => {
        const doc = err.err.op || {};
        console.warn(`\n${i + 1}. ❌ Failed hospital:`);
        console.warn(`   → Name: ${doc.name || "Unknown"}`);
        console.warn(`   → City: ${doc.address?.city || "N/A"}`);
        console.warn(`   → State: ${doc.address?.state || "N/A"}`);
        console.warn(`   → Reason: ${err.err.errmsg || err.err.message}`);
        failedHospitals.push(doc);
      });

      // Save failed hospitals to local file
      const failedPath = path.join(process.cwd(), "failed_hospitals.json");
      fs.writeFileSync(
        failedPath,
        JSON.stringify(failedHospitals, null, 2),
        "utf-8"
      );

      console.log(`\n💾 Saved ${failedHospitals.length} failed hospitals to:`);
      console.log(failedPath);
    }

    console.log("🎉 Upload process completed!");
    process.exit();
  } catch (error) {
    console.error("❌ Error uploading hospitals:", error);
    process.exit(1);
  }
}

importHospitals();
