import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import Hospital from "../models/Hospital.js";
import { embedTexts } from "../utils/embeddings.js";

dotenv.config();

const EMBEDDINGS_FILE = path.resolve("data/hospital-embeddings.json");
const BATCH_SIZE = 5; // embed 5 at a time

async function build() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const hospitals = await Hospital.find({ verified: true }).lean();
  const total = hospitals.length;
  console.log(`Found ${total} verified hospitals\n`);

  if (total === 0) {
    console.log("No verified hospitals found. Exiting.");
    process.exit(0);
  }

  const allEmbeddings = [];

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = hospitals.slice(i, i + BATCH_SIZE);
    const texts = batch.map((h) => (h.services || []).join(" ").toLowerCase());

    let batchEmbeddings;
    try {
      batchEmbeddings = await embedTexts(texts);
    } catch (err) {
      console.error(
        `Embedding failed for batch starting at index ${i}:`,
        err.message,
      );
      // skip this batch
      continue;
    }

    // batchEmbeddings is a 2D array; each row is an embedding vector
    for (let j = 0; j < batch.length; j++) {
      const vector = batchEmbeddings[j];
      if (!vector || vector.length === 0) {
        console.warn(
          `Warning: empty embedding for hospital ${batch[j]._id} (${batch[j].name})`,
        );
        continue;
      }
      allEmbeddings.push({
        hospitalId: batch[j]._id.toString(),
        embedding: vector, // already a plain array from embedTexts
      });
    }

    const done = Math.min(i + BATCH_SIZE, total);
    console.log(`Progress: ${done}/${total} hospitals embedded`);
  }

  fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(allEmbeddings), "utf-8");
  console.log(`\nEmbeddings saved to ${EMBEDDINGS_FILE}`);

  await mongoose.disconnect();
  process.exit(0);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
