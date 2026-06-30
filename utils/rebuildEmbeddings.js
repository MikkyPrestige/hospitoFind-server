import fs from 'fs';
import path from 'path';
import Hospital from '../models/Hospital.js';
import { embedTexts } from './embeddings.js';

const EMBEDDINGS_FILE = path.resolve('data/hospital-embeddings.json');
const BATCH_SIZE = 20;

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
    fs.writeFileSync(EMBEDDINGS_FILE, '[]', 'utf-8');
    console.log('Embeddings rebuild: no verified hospitals, written empty file.');
    return;
  }

  // Collect all individual services across all hospitals
  const serviceEntries = []; // { hospitalId, service }
  hospitals.forEach((h) => {
    (h.services || []).forEach((svc) => {
      serviceEntries.push({ hospitalId: h._id.toString(), service: svc.toLowerCase() });
    });
  });

  const totalServices = serviceEntries.length;
  console.log(`Embeddings rebuild: ${totalServices} individual services to embed`);

  // Embed services in batches
  const embeddingMap = new Map(); // hospitalId -> array of vectors
  for (let i = 0; i < totalServices; i += BATCH_SIZE) {
    const batch = serviceEntries.slice(i, i + BATCH_SIZE);
    const texts = batch.map((e) => e.service);

    let batchEmbeddings;
    try {
      batchEmbeddings = await embedTexts(texts);
      // Yield the event loop so the server can handle other requests
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch (err) {
      console.error(`Embeddings rebuild: batch starting at index ${i} failed:`, err.message);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const vector = batchEmbeddings[j];
      if (!vector || vector.length === 0) continue;
      const { hospitalId } = batch[j];
      if (!embeddingMap.has(hospitalId)) embeddingMap.set(hospitalId, []);
      embeddingMap.get(hospitalId).push(vector);
    }

    console.log(
      `Embeddings rebuild: ${Math.min(i + BATCH_SIZE, totalServices)}/${totalServices} services embedded`,
    );
  }

  // Convert map to array of { hospitalId, embeddings }
  const allEmbeddings = [];
  embeddingMap.forEach((embeddings, hospitalId) => {
    allEmbeddings.push({ hospitalId, embeddings });
  });

  // Also include verified hospitals that had no services (empty array)
  hospitals.forEach((h) => {
    const id = h._id.toString();
    if (!embeddingMap.has(id)) {
      allEmbeddings.push({ hospitalId: id, embeddings: [] });
    }
  });

  fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(allEmbeddings), 'utf-8');
  console.log(`Embeddings rebuild: saved to ${EMBEDDINGS_FILE}`);
};
