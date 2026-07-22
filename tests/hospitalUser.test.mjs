process.env.GROQ_API_KEY = 'test';

import { jest } from '@jest/globals';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import bcrypt from 'bcrypt';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper.mjs';

jest.setTimeout(30000);

// Mock geocode to avoid Mapbox dependency in tests
jest.unstable_mockModule('../utils/geocode.js', () => ({
  getCoordinates: jest.fn().mockResolvedValue({ longitude: 3.3792, latitude: 6.5244 }),
}));

const { default: app } = await import('../app.js');

let request;
let userToken;
let regularUserId;

const generateTestToken = (user) => {
  const payload = {
    UserInfo: {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
    },
  };
  if (user.email) payload.UserInfo.email = user.email;
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
};

beforeAll(async () => {
  await connectTestDB();
  request = supertest(app);
}, 60000);

beforeEach(async () => {
  await User.deleteMany({});
  await clearTestDB();

  const suffix = Date.now();

  const regularUser = await User.create({
    name: 'Regular User',
    username: `regularuser_${suffix}`,
    email: `regular_${suffix}@test.com`,
    password: await bcrypt.hash('password123', 10),
    role: 'user',
    isVerified: true,
  });
  regularUserId = regularUser._id.toString();
  userToken = generateTestToken(regularUser);
}, 30000);

afterAll(async () => {
  await disconnectTestDB();
});

describe('Hospital User-Facing Endpoints', () => {
  // ── USER SUBMISSION ──────────────────────────────────────
  describe('POST /hospitals', () => {
    it('should allow authenticated user to submit a hospital', async () => {
      const res = await request
        .post('/hospitals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Test Hospital',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Hospital submitted successfully and is pending review.');
      expect(res.body.hospital).toBeDefined();
      expect(res.body.hospital.verified).toBe(false);

      const Hospital = (await import('../models/Hospital.js')).default;
      const found = await Hospital.findById(res.body.hospital._id).lean();
      expect(found).not.toBeNull();
      expect(found.verified).toBe(false);
    });

    it('should fail with 400 if city or state missing', async () => {
      const res = await request
        .post('/hospitals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'No Address Hospital' });

      expect(res.status).toBe(400);
    });
  });

  // ── USER UPDATE ──────────────────────────────────────────
  describe('PATCH /hospitals/:id', () => {
    it('should allow user to update their own submission', async () => {
      const submitRes = await request
        .post('/hospitals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Update Me',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
        });
      const hospitalId = submitRes.body.hospital._id;

      const updateRes = await request
        .patch(`/hospitals/${hospitalId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Updated Hospital Name', phoneNumber: '1234567890' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.message).toBe('Update saved and sent for review.');
      expect(updateRes.body.updatedHospital.name).toBe('Updated Hospital Name');
      expect(updateRes.body.updatedHospital.phoneNumber).toBe('1234567890');
    });

    it('should fail with 404 for non-existent hospital', async () => {
      const res = await request
        .patch('/hospitals/000000000000000000000000')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  // ── USER SUBMISSIONS LIST ─────────────────────────────────
  describe('GET /hospitals/submissions', () => {
    it('should return paginated user submissions with metadata', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;

      // Seed 25 hospitals created by the regular user
      const hospitalsData = Array.from({ length: 25 }, (_, i) => ({
        name: `My Hospital ${i + 1}`,
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: false,
        services: ['general'],
        comments: [],
        hours: [],
        createdBy: new mongoose.Types.ObjectId(regularUserId),
      }));
      await Hospital.insertMany(hospitalsData);

      // Also seed a hospital created by another (should be excluded)
      await Hospital.create({
        name: 'Other User Hospital',
        address: { city: 'Abuja', state: 'Nigeria' },
        type: 'General',
        verified: false,
        services: ['general'],
        comments: [],
        hours: [],
        createdBy: new mongoose.Types.ObjectId(), // random ObjectId
      });

      const res = await request
        .get('/hospitals/submissions')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('limit', 20);
      expect(res.body).toHaveProperty('total', 25);
      expect(res.body).toHaveProperty('totalPages', 2);
      expect(Array.isArray(res.body.hospitals)).toBe(true);
      expect(res.body.hospitals.length).toBe(20);
      // All returned hospitals should belong to the user
      res.body.hospitals.forEach((h) => {
        expect(h.createdBy.toString()).toBe(regularUserId);
      });
    });

    it('should respect custom page and limit', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;

      const hospitalsData = Array.from({ length: 12 }, (_, i) => ({
        name: `My Hospital ${i + 1}`,
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: false,
        services: ['general'],
        comments: [],
        hours: [],
        createdBy: new mongoose.Types.ObjectId(regularUserId),
      }));
      await Hospital.insertMany(hospitalsData);

      const res = await request
        .get('/hospitals/submissions?page=2&limit=5')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(5);
      expect(res.body.total).toBe(12);
      expect(res.body.totalPages).toBe(3); // ceil(12/5)=3
      expect(res.body.hospitals.length).toBe(5);
    });

    it('should return empty array for out-of-range page', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;

      await Hospital.create({
        name: 'My Only Hospital',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: false,
        services: ['general'],
        comments: [],
        hours: [],
        createdBy: new mongoose.Types.ObjectId(regularUserId),
      });

      const res = await request
        .get('/hospitals/submissions?page=5')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.hospitals).toEqual([]);
    });

    it('should return 401 if no token', async () => {
      const res = await request.get('/hospitals/submissions');
      expect(res.status).toBe(401);
    });
  });

  // ── SHARE HOSPITALS ─────────────────────────────────────
  describe('POST /hospitals/share', () => {
    it('should create a share link for matched hospitals', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospitalsData = Array.from({ length: 5 }, (_, i) => ({
        name: `Share Hospital ${i + 1}`,
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      }));
      await Promise.all(hospitalsData.map((h) => Hospital.create(h)));

      const res = await request
        .post('/hospitals/share')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ searchParams: { state: 'Nigeria' } });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('linkId');
      expect(res.body.totalFound).toBe(5);
      expect(res.body.truncated).toBe(false);
      expect(res.body.message).not.toContain('limited');
    });

    it('should truncate when results exceed limit', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospitalsData = Array.from({ length: 101 }, (_, i) => ({
        name: `Share Hospital ${i + 1}`,
        slug: `share-hospital-${i + 1}-${Date.now()}`,
        address: { city: 'Abuja', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      }));
      await Hospital.insertMany(hospitalsData);

      const res = await request
        .post('/hospitals/share')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ searchParams: { state: 'Nigeria' } });

      expect(res.status).toBe(201);
      expect(res.body.totalFound).toBe(101);
      expect(res.body.truncated).toBe(true);
      expect(res.body.message).toContain('limited to 100');

      const ShareableLink = (await import('../models/Share.js')).default;
      const link = await ShareableLink.findOne({ linkId: res.body.linkId }).lean();
      expect(link.hospitals.length).toBe(100);
    }, 60000);

    it('should return 404 if no hospitals match', async () => {
      const res = await request
        .post('/hospitals/share')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ searchParams: { state: 'Nowhere' } });

      expect(res.status).toBe(404);
    });
  });

  // ── EXPORT HOSPITALS ────────────────────────────────────
  describe('GET /hospitals/export', () => {
    it('should export matched hospitals as CSV', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospitalsData = Array.from({ length: 5 }, (_, i) => ({
        name: `Export Hospital ${i + 1}`,
        slug: `export-hospital-${i + 1}-${Date.now()}`,
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      }));
      await Hospital.insertMany(hospitalsData);

      const res = await request.get('/hospitals/export?state=Nigeria');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      const lines = res.text.trim().split('\n');
      expect(lines.length).toBe(6); // header + 5 rows
      expect(res.headers['x-export-truncated']).toBeUndefined();
    });

    it('should truncate when results exceed limit', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospitalsData = Array.from({ length: 101 }, (_, i) => ({
        name: `Export Hospital ${i + 1}`,
        slug: `export-hospital-${i + 1}-${Date.now()}`,
        address: { city: 'Abuja', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      }));
      await Hospital.insertMany(hospitalsData);

      const res = await request.get('/hospitals/export?state=Nigeria');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['x-export-truncated']).toBe('true');
      expect(res.headers['x-export-total-found']).toBe('101');
      const lines = res.text.trim().split('\n');
      expect(lines.length).toBe(101); // header + 100 rows
    }, 60000);

    it('should return 404 if no hospitals match', async () => {
      const res = await request.get('/hospitals/export?state=Nowhere');
      expect(res.status).toBe(404);
    });
  });
});
