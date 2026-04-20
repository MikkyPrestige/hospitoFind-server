import mongoose from "mongoose";
import dotenv from "dotenv";
import Hospital from "../models/hospitalsModel.js";

dotenv.config();

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to DB...");

    const hospitals = await Hospital.find({});
    let count = 0;

    for (const h of hospitals) {
      if (
        h.latitude &&
        h.longitude &&
        (!h.location || !h.location.coordinates)
      ) {
        h.location = {
          type: "Point",
          coordinates: [h.longitude, h.latitude],
        };

        await h.save();
        count++;
        console.log(`Updated: ${h.name}`);
      }
    }

    console.log(`Migration Complete! Updated ${count} hospitals.`);

    console.log("Creating Index...");
    await Hospital.collection.createIndex({ location: "2dsphere" });
    console.log("Index Created Successfully!");

    process.exit();
  } catch (error) {
    console.error("Migration Failed:", error);
    process.exit(1);
  }
};

migrate();