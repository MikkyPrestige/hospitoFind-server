import crypto from 'crypto';
import getGroq from './groqClient.js';
import { getAllowedServices } from './allowedServices.js';
import { cacheGet, cacheSet } from './cache.js';

const CACHE_PREFIX = 'ai:symptom:';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Deterministic hash for cache key
 */
function hash(text) {
  return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 32);
}

/**
 * Classify a free-text symptom description into medical service names.
 * @param {string} symptomText
 * @returns {Promise<string[]>}
 */
export async function classifySymptoms(symptomText) {
  if (!symptomText || typeof symptomText !== 'string') return [];

  const cacheKey = CACHE_PREFIX + hash(symptomText);

  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore corrupted cache
    }
  }

  try {
    const allowedServices = await getAllowedServices();
    if (!allowedServices.length) return [];

    const prompt = `
You are a medical triage assistant. Given a patient's symptom description, return a JSON array of the most relevant medical specialties from the list below.

Allowed services (only these exactly as written):
${allowedServices.join(', ')}

Symptom description: "${symptomText}"

Instructions:
- Return ONLY a JSON array of strings, no additional text.
- Choose 1-3 most relevant services.
- If no service fits, return an empty array [].
- Do not invent new services.
`.trim();

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.0,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '[]';
    // Extract JSON array (in case model wraps in text)
    const arrayMatch = raw.match(/\[.*\]/s);
    const jsonStr = arrayMatch ? arrayMatch[0] : '[]';
    let services = JSON.parse(jsonStr);

    if (!Array.isArray(services)) services = [];
    // Filter only valid allowed services (case-insensitive)
    const validSet = new Set(allowedServices.map((s) => s.toLowerCase()));
    services = services.filter((s) => typeof s === 'string' && validSet.has(s.toLowerCase()));

    // Cache result (empty array also cached to prevent retries)
    await cacheSet(cacheKey, JSON.stringify(services), CACHE_TTL_MS);
    return services;
  } catch (err) {
    console.error('AI symptom classification failed:', err);
    return [];
  }
}
