import fs from "fs";
import path from "path";
import Hospital from "../models/Hospital.js";
import { embedTexts } from "./embeddings.js";

const EMBEDDINGS_FILE = path.resolve("data/hospital-embeddings.json");
const BATCH_SIZE = 5;

/**
 * Rebuild the hospital embeddings file from all verified hospitals.
 * Should be called when the server already has an active mongoose connection.
 */
export const rebuildEmbeddings = async () => {
  const hospitals = await Hospital.find({ verified: true }).lean();
  const total = hospitals.length;
  console.log(`Embeddings rebuild: found ${total} verified hospitals`);

  if (total === 0) {
    // Write an empty file rather than leaving stale data
    fs.writeFileSync(EMBEDDINGS_FILE, "[]", "utf-8");
    console.log(
      "Embeddings rebuild: no verified hospitals, written empty file.",
    );
    return;
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
        `Embeddings rebuild: batch starting at index ${i} failed:`,
        err.message,
      );
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const vector = batchEmbeddings[j];
      if (!vector || vector.length === 0) {
        console.warn(
          `Embeddings rebuild: empty embedding for hospital ${batch[j]._id} (${batch[j].name})`,
        );
        continue;
      }
      allEmbeddings.push({
        hospitalId: batch[j]._id.toString(),
        embedding: vector,
      });
    }

    const done = Math.min(i + BATCH_SIZE, total);
    console.log(`Embeddings rebuild: ${done}/${total} hospitals embedded`);
  }

  fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(allEmbeddings), "utf-8");
  console.log(`Embeddings rebuild: saved to ${EMBEDDINGS_FILE}`);
};
