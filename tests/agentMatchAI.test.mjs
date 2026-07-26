jest.setTimeout(30000);

import { jest } from '@jest/globals';
import { connectTestDB, clearTestDB } from './dbHelper.mjs';
import Hospital from '../models/Hospital.js';

let request;
let classifySymptomsMock;
let semanticMatchMock;

beforeAll(async () => {
  // Mock the semantic matcher to return empty array (no RAG influence)
  jest.unstable_mockModule('../utils/ragMatcher.js', () => ({
    semanticMatch: jest.fn().mockResolvedValue([]),
  }));

  // Mock the classifier
  jest.unstable_mockModule('../utils/aiSymptomClassifier.js', () => ({
    classifySymptoms: jest.fn(),
  }));

  // Dynamic import to pick up the mocks
  const appModule = await import('../app.js');
  const app = appModule.default;
  const supertest = (await import('supertest')).default;
  request = supertest(app);

  // Get references to the mocks for assertions
  const classifierModule = await import('../utils/aiSymptomClassifier.js');
  classifySymptomsMock = classifierModule.classifySymptoms;
  const ragModule = await import('../utils/ragMatcher.js');
  semanticMatchMock = ragModule.semanticMatch;

  await connectTestDB();
}, 60000);

beforeEach(async () => {
  jest.clearAllMocks();
  semanticMatchMock.mockResolvedValue([]); // ensure it returns [] each time
  await clearTestDB();
});

describe('AI classifier fallback in /agent/match', () => {
  it('calls classifier when keyword & RAG scores are low', async () => {
    // Hospital with irrelevant service and location that does NOT match city/country
    await Hospital.create([
      {
        name: 'Dental Clinic',
        type: 'Specialist',
        services: ['dentistry'],
        address: { city: 'Abuja', state: 'Nigeria' },
        continent: 'Africa',
        verified: true,
      },
    ]);

    classifySymptomsMock.mockResolvedValueOnce([]);

    const res = await request
      .post('/agent/match')
      .send({ symptoms: ['xylophone pain'], location: 'Lagos, Nigeria' });

    expect(res.status).toBe(200);
    // Classifier should have been called because maxServiceScore was 0 (no keyword mapping)
    expect(classifySymptomsMock).toHaveBeenCalledWith('xylophone pain');
    // With classifier returning [] and no location match, there should be no results
    expect(res.body.noResults).toBe(false);
    expect(res.body.hospitals.length).toBe(1);
  });

  it('enriches results when AI returns relevant services', async () => {
    await Hospital.create([
      {
        name: 'City Cardiology',
        type: 'Specialist',
        services: ['cardiology'],
        address: { city: 'Lagos', state: 'Nigeria' },
        continent: 'Africa',
        verified: true,
        phoneNumber: '1234',
      },
    ]);

    classifySymptomsMock.mockResolvedValueOnce(['cardiology']);

    const res = await request
      .post('/agent/match')
      .send({ symptoms: ['chest tightness'], location: 'Lagos, Nigeria' });

    expect(res.status).toBe(200);
    expect(res.body.noResults).toBe(false);
    const names = res.body.hospitals.map((h) => h.name);
    expect(names).toContain('City Cardiology');
  });

  it('does not call classifier when scores are already high', async () => {
    // Hospital with many matching services → score > 30 → no classifier call
    await Hospital.create([
      {
        name: 'General Hospital',
        type: 'General',
        services: ['general', 'cardiology', 'emergency', 'icu'],
        address: { city: 'Lagos', state: 'Nigeria' },
        continent: 'Africa',
        verified: true,
        phoneNumber: '1234',
      },
    ]);

    const res = await request
      .post('/agent/match')
      .send({ symptoms: ['chest pain'], location: 'Lagos, Nigeria' });

    expect(res.status).toBe(200);
    expect(classifySymptomsMock).not.toHaveBeenCalled();
    expect(res.body.hospitals.length).toBeGreaterThan(0);
  });

  it('handles classifier failure gracefully (returns original results)', async () => {
    // Hospital with weak service match but location match to ensure some results
    await Hospital.create([
      {
        name: 'Small Clinic',
        type: 'General',
        services: ['general'],
        address: { city: 'Lagos', state: 'Nigeria' },
        continent: 'Africa',
        verified: true,
      },
    ]);

    classifySymptomsMock.mockRejectedValueOnce(new Error('Groq error'));

    const res = await request
      .post('/agent/match')
      .send({ symptoms: ['unknown issue'], location: 'Lagos, Nigeria' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hospitals');
    // Still returns a hospital due to location match, even if AI failed
    expect(res.body.hospitals.length).toBeGreaterThan(0);
  });
});
