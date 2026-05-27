import fs from "fs";
import path from "path";

const EMBEDDINGS_FILE = path.resolve("data/hospital-embeddings.json");

let hospitalVectors = null; // in‑memory cache: { hospitalId, embedding }[]

const loadEmbeddings = () => {
  if (hospitalVectors) return hospitalVectors;
  if (!fs.existsSync(EMBEDDINGS_FILE)) return null;
  hospitalVectors = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, "utf-8"));
  return hospitalVectors.length ? hospitalVectors : null;
};

const cosineSimilarity = (a, b) => {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
};

/**
 * Find top‑K semantically similar hospitals to the query.
 * @param {string} query - symptoms text
 * @param {number} topK
 * @returns {Promise<{hospitalId: string, score: number}[]>}
 */
export const semanticMatch = async (query, topK = 5) => {
    console.log("RAG: semanticMatch called with query:", query);
  if (process.env.SKIP_RAG === "true") return [];
  const entries = loadEmbeddings();
  console.log(
    "RAG: loaded embeddings entries:",
    entries ? entries.length : "null",
  );
  if (!entries) return []; // fallback to keyword matching

  const { embedTexts } = await import("./embeddings.js");
  const [queryVec] = await embedTexts([query]);
  console.log(
    "RAG: query embedding generated, length:",
    queryVec ? queryVec.length : "null",
  );
  if (!queryVec) return [];

  const scored = entries.map(({ hospitalId, embedding }) => ({
    hospitalId,
    score: cosineSimilarity(queryVec, embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  console.log("RAG: top score:", scored[0]?.score);
  return scored.slice(0, topK).filter((s) => s.score > 0);
};
