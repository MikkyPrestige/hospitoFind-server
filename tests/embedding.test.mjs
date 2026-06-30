import { embedTexts } from '../utils/embeddings.js';

describe('Transformers.js embeddings', () => {
  const isCI = process.env.CI === 'true';

  (isCI ? it.skip : it)(
    'generates an embedding for a single sentence',
    async () => {
      const [vec] = await embedTexts(['cardiology emergency']);
      expect(Array.isArray(vec)).toBe(true);
      expect(vec.length).toBeGreaterThan(0);
    },
    60000,
  );
});
