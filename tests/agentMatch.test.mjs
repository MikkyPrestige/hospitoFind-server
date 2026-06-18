import { jest } from '@jest/globals';
import supertest from 'supertest';
import app from '../app.js';
import Hospital from '../models/Hospital.js';
import { connectTestDB, clearTestDB } from './dbHelper.mjs';

jest.setTimeout(20000);

let request;

beforeAll(async () => {
  await connectTestDB();
  request = supertest(app);
}, 60000);

describe('POST /agent/match with continent pre-filter', () => {
  beforeEach(async () => {
    await clearTestDB();
  });

  it('only matches hospitals on the same continent', async () => {
    await Hospital.create([
      {
        name: 'Nairobi General',
        type: 'General',
        services: ['general', 'infectious disease'],
        address: { city: 'Nairobi', state: 'Kenya' },
        continent: 'Africa',
        verified: true,
      },
      {
        name: 'Berlin Heart Center',
        type: 'Specialist',
        services: ['cardiology', 'emergency'],
        address: { city: 'Berlin', state: 'Germany' },
        continent: 'Europe',
        verified: true,
        phoneNumber: '12345',
      },
    ]);

    // Wait until the seeds are actually visible (prevents race condition)
    let count = 0;
    const deadline = Date.now() + 10000; // 10-second window
    while (Date.now() < deadline && count < 2) {
      count = await Hospital.countDocuments({});
      if (count >= 2) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(count).toBeGreaterThanOrEqual(2);

    const res = await request
      .post('/agent/match')
      .send({ symptoms: ['chest pain'], location: 'Nairobi, Kenya' });

    expect(res.status).toBe(200);
    expect(res.body.hospitals.length).toBe(1);
    expect(res.body.hospitals[0].name).toBe('Nairobi General');
  }, 90000);

  it('GET /hospitals returns paginated results', async () => {
    await Hospital.create([
      {
        name: 'H1',
        type: 'General',
        address: { city: 'Lagos', state: 'Nigeria' },
        continent: 'Africa',
        verified: true,
        services: ['general'],
      },
      {
        name: 'H2',
        type: 'General',
        address: { city: 'Abuja', state: 'Nigeria' },
        continent: 'Africa',
        verified: true,
        services: ['general'],
      },
      {
        name: 'H3',
        type: 'General',
        address: { city: 'Kano', state: 'Nigeria' },
        continent: 'Africa',
        verified: true,
        services: ['general'],
      },
    ]);

    const res = await request.get('/hospitals?page=1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(2);
    expect(res.body.total).toBe(3);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.hospitals.length).toBe(2);
  });

  it('returns 400 when symptoms are missing', async () => {
    const res = await request.post('/agent/match').send({ symptoms: [], location: 'Lagos' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });
});
