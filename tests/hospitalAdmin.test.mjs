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

// Re-import app after mocks
const { default: app } = await import('../app.js');

let request;

let userToken;
let adminToken;
let regularUserId;
let adminUserId;

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

  const adminUser = await User.create({
    name: 'Admin User',
    username: `adminuser_${suffix}`,
    email: `admin_${suffix}@test.com`,
    password: await bcrypt.hash('adminpass', 10),
    role: 'admin',
    isVerified: true,
  });
  adminUserId = adminUser._id.toString();

  userToken = generateTestToken(regularUser);

  // Generate admin token directly – no login required
  adminToken = generateTestToken(adminUser);
}, 30000);

afterAll(async () => {
  await disconnectTestDB();
});

describe('Hospital CRUD & Admin Flows', () => {
  // ── ADMIN DELETE ─────────────────────────────────────────
  describe('DELETE /admin/hospitals/:id', () => {
    it('should allow admin to delete a hospital', async () => {
      const submitRes = await request
        .post('/hospitals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'To Be Deleted',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
        });
      const hospitalId = submitRes.body.hospital._id;

      const deleteRes = await request
        .delete(`/admin/hospitals/${hospitalId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toBe('Hospital deleted successfully');

      const Hospital = (await import('../models/Hospital.js')).default;
      const found = await Hospital.findById(hospitalId).lean();
      expect(found).toBeNull();
    });

    it('should fail with 404 for non-existent hospital', async () => {
      const res = await request
        .delete('/admin/hospitals/000000000000000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ── ADMIN APPROVE ────────────────────────────────────────
  describe('PATCH /admin/hospitals/approve/:id', () => {
    it('should allow admin to approve a pending hospital', async () => {
      const submitRes = await request
        .post('/hospitals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Approve Me',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
        });
      const hospitalId = submitRes.body.hospital._id;
      const hospitalData = submitRes.body.hospital;

      const approveRes = await request
        .patch(`/admin/hospitals/approve/${hospitalId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: hospitalData.name,
          address: hospitalData.address,
          type: hospitalData.type,
          services: hospitalData.services || ['general'],
          comments: hospitalData.comments || [],
          hours: hospitalData.hours || [],
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.message).toContain('Hospital approved!');

      const Hospital = (await import('../models/Hospital.js')).default;
      const found = await Hospital.findById(hospitalId).lean();
      expect(found.verified).toBe(true);
    });

    it('should fail with 400 for non-existent hospital', async () => {
      const res = await request
        .patch('/admin/hospitals/approve/000000000000000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Ghost',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
          services: ['general'],
          comments: [],
          hours: [],
        });

      expect(res.status).toBe(404); // not found after validation passes
    });
  });

  // ── ADMIN TOGGLE STATUS ──────────────────────────────────
  describe('PATCH /admin/hospitals/:id/toggle-status', () => {
    it('should toggle hospital verification status', async () => {
      const submitRes = await request
        .post('/hospitals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Toggle Test',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
        });
      const hospitalId = submitRes.body.hospital._id;
      expect(submitRes.body.hospital.verified).toBe(false);

      const toggleRes = await request
        .patch(`/admin/hospitals/${hospitalId}/toggle-status`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(toggleRes.status).toBe(200);
      expect(toggleRes.body.verified).toBe(true);

      const Hospital = (await import('../models/Hospital.js')).default;
      const found = await Hospital.findById(hospitalId).lean();
      expect(found.verified).toBe(true);
    });

    it('should fail with 404 for non-existent hospital', async () => {
      const res = await request
        .patch('/admin/hospitals/000000000000000000000000/toggle-status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ── ADMIN PENDING LIST ───────────────────────────────────
  describe('GET /admin/hospitals/pending', () => {
    it('should return paginated pending hospitals with metadata', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;

      // Seed 25 unverified hospitals
      const pendingDocs = Array.from({ length: 25 }, (_, i) => ({
        name: `Pending Hospital ${i + 1}`,
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: false,
        services: ['general'],
        comments: [],
        hours: [],
      }));
      await Hospital.insertMany(pendingDocs);

      // Seed a verified hospital (should be excluded)
      await Hospital.create({
        name: 'Already Verified Hospital',
        address: { city: 'Abuja', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
        createdBy: new mongoose.Types.ObjectId(adminUserId),
      });

      // Default page (1), limit (20)
      const res = await request
        .get('/admin/hospitals/pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('limit', 20);
      expect(res.body).toHaveProperty('total', 25);
      expect(res.body).toHaveProperty('totalPages', 2);
      expect(Array.isArray(res.body.hospitals)).toBe(true);
      expect(res.body.hospitals.length).toBe(20);
      // Ensure none are verified
      res.body.hospitals.forEach((h) => {
        expect(h.verified).toBe(false);
      });
      expect(res.body.hospitals[0].name).toMatch(/Pending Hospital \d+/);
    });

    it('should respect custom page and limit', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const pendingDocs = Array.from({ length: 15 }, (_, i) => ({
        name: `P ${i + 1}`,
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: false,
      }));
      await Hospital.insertMany(pendingDocs);

      const res = await request
        .get('/admin/hospitals/pending?page=2&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(5);
      expect(res.body.total).toBe(15);
      expect(res.body.totalPages).toBe(3);
      expect(res.body.hospitals.length).toBe(5);
    });

    it('should return empty array for out-of-range page', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      await Hospital.insertMany([
        {
          name: 'Only',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
          verified: false,
        },
      ]);

      const res = await request
        .get('/admin/hospitals/pending?page=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.hospitals).toEqual([]);
    });
  });

  // ── ADMIN BATCH APPROVE ──────────────────────────────────
  describe('PATCH /admin/hospitals/approve-batch', () => {
    it('should approve multiple pending hospitals at once', async () => {
      const res1 = await request
        .post('/hospitals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Batch Hospital 1',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
        });
      const res2 = await request
        .post('/hospitals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Batch Hospital 2',
          address: { city: 'Abuja', state: 'Nigeria' },
          type: 'General',
        });

      const ids = [res1.body.hospital._id, res2.body.hospital._id];

      const batchRes = await request
        .patch('/admin/hospitals/approve-batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids });

      expect(batchRes.status).toBe(200);
      expect(batchRes.body.modifiedCount).toBe(2);

      const Hospital = (await import('../models/Hospital.js')).default;
      const found1 = await Hospital.findById(ids[0]).lean();
      const found2 = await Hospital.findById(ids[1]).lean();
      expect(found1.verified).toBe(true);
      expect(found2.verified).toBe(true);
    });

    it('should return 400 for empty id array', async () => {
      const res = await request
        .patch('/admin/hospitals/approve-batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [] });

      expect(res.status).toBe(400);
    });
  });

  // ── ADMIN OSM IMPORT (DRY RUN) ───────────────────────────
  describe('POST /admin/hospitals/import-osm', () => {
    it('should return preview without saving (dry-run)', async () => {
      const axios = (await import('axios')).default;
      const originalGet = axios.get;
      axios.get = jest.fn().mockResolvedValueOnce({
        data: {
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 6.5244,
              lon: 3.3792,
              tags: {
                name: 'Mock OSM Hospital',
                'addr:city': 'Lagos',
                'addr:street': '123 Test St',
                phone: '+2341234567890',
              },
            },
          ],
        },
      });

      const res = await request
        .post('/admin/hospitals/import-osm?dryRun=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ city: 'Lagos', targetCountry: 'Nigeria' });

      axios.get = originalGet;

      expect(res.status).toBe(200);
      expect(res.body.imported).toBeGreaterThanOrEqual(1);
      expect(res.body.preview).toBeDefined();

      const Hospital = (await import('../models/Hospital.js')).default;
      const count = await Hospital.countDocuments();
      expect(count).toBe(0);
    });
  });

  // ── ADMIN GOOGLE IMPORT ────────────────────────────────
  describe('POST /admin/hospitals/import-google', () => {
    it('should import hospitals from Google Places', async () => {
      const axios = (await import('axios')).default;
      const originalGet = axios.get;

      // Mock search response
      axios.get = jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            status: 'OK',
            results: [
              { place_id: 'place1', name: 'Google Hospital 1' },
              { place_id: 'place2', name: 'Google Hospital 2' },
            ],
          },
        })
        // Mock details for place1
        .mockResolvedValueOnce({
          data: {
            result: {
              name: 'Google Hospital 1',
              formatted_address: '123 Main St, Lagos, Nigeria',
              formatted_phone_number: '+234 800 000 0001',
              website: 'https://googlehospital1.com',
              types: ['hospital', 'general'],
              geometry: { location: { lat: 6.5244, lng: 3.3792 } },
              opening_hours: { weekday_text: ['Monday: 9am-5pm'] },
              reviews: [{ text: 'Great service', author_name: 'John' }],
              photos: undefined,
            },
          },
        })
        // Mock details for place2
        .mockResolvedValueOnce({
          data: {
            result: {
              name: 'Google Hospital 2',
              formatted_address: '456 Second St, Lagos, Nigeria',
              formatted_phone_number: '+234 800 000 0002',
              website: 'https://googlehospital2.com',
              types: ['hospital', 'specialist'],
              geometry: { location: { lat: 6.6, lng: 3.4 } },
              opening_hours: { weekday_text: ['Tuesday: 8am-4pm'] },
              reviews: [],
              photos: undefined,
            },
          },
        });

      const res = await request
        .post('/admin/hospitals/import-google')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ city: 'Lagos', targetCountry: 'Nigeria' });

      // Restore original axios
      axios.get = originalGet;

      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(2);
      expect(res.body.skipped).toBe(0);
      expect(res.body.message).toContain('Import complete');

      // Verify hospitals were saved
      const Hospital = (await import('../models/Hospital.js')).default;
      const saved = await Hospital.find({
        name: { $in: ['Google Hospital 1', 'Google Hospital 2'] },
      }).lean();
      expect(saved.length).toBe(2);
    });

    it('should skip duplicates in Google import', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      // Pre-create one hospital
      await Hospital.create({
        name: 'Google Hospital 1',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: false,
        services: ['general'],
        comments: [],
        hours: [],
      });

      const axios = (await import('axios')).default;
      const originalGet = axios.get;

      axios.get = jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            status: 'OK',
            results: [
              { place_id: 'place1', name: 'Google Hospital 1' },
              { place_id: 'place2', name: 'Google Hospital 3' },
            ],
          },
        })
        // details for place1 (duplicate) - not called? the function checks duplicate before details, so no need to mock details for duplicate.
        // But the code does: for each place, it checks exists. If exists, skippedCount++, continue. So it will not call details for place1.
        // So only mock details for place2.
        .mockResolvedValueOnce({
          data: {
            result: {
              name: 'Google Hospital 3',
              formatted_address: '789 Third St, Lagos, Nigeria',
              formatted_phone_number: '+234 800 000 0003',
              website: '',
              types: ['hospital'],
              geometry: { location: { lat: 6.7, lng: 3.5 } },
              opening_hours: undefined,
              reviews: [],
              photos: undefined,
            },
          },
        });

      const res = await request
        .post('/admin/hospitals/import-google')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ city: 'Lagos', targetCountry: 'Nigeria' });

      axios.get = originalGet;

      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(res.body.skipped).toBe(1);
    });

    it('should return 400 on Google API error', async () => {
      const axios = (await import('axios')).default;
      const originalGet = axios.get;

      axios.get = jest.fn().mockResolvedValueOnce({
        data: { status: 'REQUEST_DENIED' },
      });

      const res = await request
        .post('/admin/hospitals/import-google')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ city: 'Lagos', targetCountry: 'Nigeria' });

      axios.get = originalGet;

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Google API Error');
    });

    it('should return 404 if no hospitals found', async () => {
      const axios = (await import('axios')).default;
      const originalGet = axios.get;

      axios.get = jest.fn().mockResolvedValueOnce({
        data: { status: 'ZERO_RESULTS', results: [] },
      });

      const res = await request
        .post('/admin/hospitals/import-google')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ city: 'Nowhere', targetCountry: 'Nigeria' });

      axios.get = originalGet;

      expect(res.status).toBe(404);
    });
  });

  // ── ADMIN DASHBOARD ──────────────────────────────────────
  describe('GET /admin/stats', () => {
    it('should return dashboard statistics', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;

      // Seed 5 verified and 3 pending hospitals
      await Hospital.insertMany([
        {
          name: 'Verified 1',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
          verified: true,
          services: ['general'],
          comments: [],
          hours: [],
        },
        {
          name: 'Verified 2',
          address: { city: 'Abuja', state: 'Nigeria' },
          type: 'General',
          verified: true,
          services: ['general'],
          comments: [],
          hours: [],
        },
        {
          name: 'Verified 3',
          address: { city: 'Kano', state: 'Nigeria' },
          type: 'General',
          verified: true,
          services: ['general'],
          comments: [],
          hours: [],
        },
        {
          name: 'Verified 4',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
          verified: true,
          services: ['general'],
          comments: [],
          hours: [],
        },
        {
          name: 'Verified 5',
          address: { city: 'Abuja', state: 'Nigeria' },
          type: 'General',
          verified: true,
          services: ['general'],
          comments: [],
          hours: [],
        },
        {
          name: 'Pending 1',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
          verified: false,
          services: ['general'],
          comments: [],
          hours: [],
        },
        {
          name: 'Pending 2',
          address: { city: 'Abuja', state: 'Nigeria' },
          type: 'General',
          verified: false,
          services: ['general'],
          comments: [],
          hours: [],
        },
        {
          name: 'Pending 3',
          address: { city: 'Kano', state: 'Nigeria' },
          type: 'General',
          verified: false,
          services: ['general'],
          comments: [],
          hours: [],
        },
      ]);

      const res = await request.get('/admin/stats').set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalHospitals).toBe(8);
      expect(res.body.pendingHospitals).toBe(3);
      expect(res.body.liveHospitals).toBe(5);
      expect(res.body.totalUsers).toBe(2); // regular + admin from beforeEach
    });
  });

  // ── ADMIN USER CRUD ──────────────────────────────────────
  describe('Admin User Management', () => {
    describe('GET /admin/users', () => {
      it('should return paginated users with metadata', async () => {
        // Seed extra users so we have >20 (use create for hashing)
        const usersToCreate = Array.from({ length: 23 }, (_, i) => ({
          name: `User ${i}`,
          username: `user${i}_${Date.now()}`,
          email: `user${i}_${Date.now()}@test.com`,
          password: 'password123',
          role: 'user',
          isVerified: true,
        }));
        await Promise.all(usersToCreate.map((u) => User.create(u)));

        const res = await request.get('/admin/users').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('page', 1);
        expect(res.body).toHaveProperty('limit', 20);
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('totalPages');
        expect(res.body).toHaveProperty('users');
        expect(Array.isArray(res.body.users)).toBe(true);
        expect(res.body.users.length).toBe(20);
        // Passwords must not be exposed
        res.body.users.forEach((user) => {
          expect(user.password).toBeUndefined();
        });
        // Check some seeded names appear
        const names = res.body.users.map((u) => u.name);
        expect(names.some((n) => n.startsWith('User '))).toBe(true);
      });

      it('should respect custom page and limit', async () => {
        // Add 12 extra users (besides the beforeEach regular/admin)
        const users = Array.from({ length: 12 }, (_, i) => ({
          name: `Extra User ${i}`,
          username: `extrauser${i}_${Date.now()}`,
          email: `extra${i}_${Date.now()}@test.com`,
          password: 'password123',
          role: 'user',
          isVerified: true,
        }));
        await Promise.all(users.map((u) => User.create(u)));

        const res = await request
          .get('/admin/users?page=2&limit=5')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.page).toBe(2);
        expect(res.body.limit).toBe(5);
        expect(res.body.total).toBe(14); // 12 new + 2 from beforeEach = 14
        expect(res.body.totalPages).toBe(3); // ceil(14/5) = 3
        expect(res.body.users.length).toBe(5);
      });

      it('should return empty users array for out-of-range page', async () => {
        // Only the 2 users from beforeEach exist
        const res = await request
          .get('/admin/users?page=5')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.users).toEqual([]);
      });
    });

    describe('POST /admin/users', () => {
      it('should create a new user via admin', async () => {
        const email = `created_${Date.now()}@test.com`;
        const res = await request
          .post('/admin/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Created User',
            username: `createduser_${Date.now()}`,
            email,
            password: 'password123',
            role: 'user',
          });

        expect(res.status).toBe(201);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.username).toBeDefined();
      });

      it('should return 409 for duplicate email', async () => {
        const email = `dupemail_${Date.now()}@test.com`;

        await request
          .post('/admin/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'First User',
            username: `firstuser_${Date.now()}`,
            email,
            password: 'password123',
          });

        const res2 = await request
          .post('/admin/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Second User',
            username: `seconduser_${Date.now()}`,
            email,
            password: 'password123',
          });

        expect(res2.status).toBe(409);
      });
    });

    describe('PATCH /admin/users/:id', () => {
      it('should update user status', async () => {
        const res = await request
          .patch(`/admin/users/${regularUserId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBeDefined();
      });
    });

    describe('PATCH /admin/users/role', () => {
      it('should allow admin to change a user role', async () => {
        const res = await request
          .patch('/admin/users/role')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: regularUserId, newRole: 'admin' });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('now a admin');

        const updatedUser = await User.findById(regularUserId).lean();
        expect(updatedUser.role).toBe('admin');
      });

      it('should fail with 400 for invalid role', async () => {
        const res = await request
          .patch('/admin/users/role')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: regularUserId, newRole: 'superadmin' });

        expect(res.status).toBe(400);
      });

      it('should prevent admin from demoting themselves', async () => {
        const res = await request
          .patch('/admin/users/role')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: adminUserId, newRole: 'user' });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('cannot demote yourself');
      });
    });

    describe('DELETE /admin/users/:id', () => {
      it('should delete a user', async () => {
        const newUser = await request
          .post('/admin/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'To Delete',
            username: `todelete_${Date.now()}`,
            email: `delete_${Date.now()}@test.com`,
            password: 'password123',
          });

        const userId = newUser.body.user.id;

        const res = await request
          .delete(`/admin/users/${userId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('deleted');
      });
    });
  });

  // ── ADMIN SYMPTOM MAPPINGS ──────────────────────────────
  describe('Symptom Mappings', () => {
    it('should return paginated symptom mappings with metadata', async () => {
      const SymptomMapping = (await import('../models/SymptomMapping.js')).default;
      // Seed 25 mappings
      const mappingsData = Array.from({ length: 25 }, (_, i) => ({
        symptomKeywords: [`symptom${i}`],
        services: [`service${i}`],
      }));
      await SymptomMapping.insertMany(mappingsData);

      const res = await request.get('/admin/symptoms').set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('limit', 20);
      expect(res.body).toHaveProperty('total', 25);
      expect(res.body).toHaveProperty('totalPages', 2);
      expect(res.body).toHaveProperty('mappings');
      expect(Array.isArray(res.body.mappings)).toBe(true);
      expect(res.body.mappings.length).toBe(20);
    });

    it('should respect custom page and limit', async () => {
      const SymptomMapping = (await import('../models/SymptomMapping.js')).default;
      const mappingsData = Array.from({ length: 12 }, (_, i) => ({
        symptomKeywords: [`symptom${i}`],
        services: [`service${i}`],
      }));
      await SymptomMapping.insertMany(mappingsData);

      const res = await request
        .get('/admin/symptoms?page=2&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(5);
      expect(res.body.total).toBe(12);
      expect(res.body.totalPages).toBe(3); // ceil(12/5)=3
      expect(res.body.mappings.length).toBe(5);
    });

    it('should return empty mappings array for out-of-range page', async () => {
      const SymptomMapping = (await import('../models/SymptomMapping.js')).default;
      await SymptomMapping.create({
        symptomKeywords: ['test'],
        services: ['testService'],
      });

      const res = await request
        .get('/admin/symptoms?page=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.mappings).toEqual([]);
    });

    // ── Symptom CRUD ─────────────────────────────────────
    it('should create a symptom mapping via admin', async () => {
      const res = await request
        .post('/admin/symptoms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          symptomKeywords: ['cough', 'fever'],
          services: ['General Checkup', 'Laboratory'],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.symptomKeywords).toEqual(['cough', 'fever']);
      expect(res.body.services).toEqual(['General Checkup', 'Laboratory']);
    });

    it('should fail to create with missing fields', async () => {
      const res = await request
        .post('/admin/symptoms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ symptomKeywords: ['cough'] }); // missing services

      expect(res.status).toBe(400);
    });

    it('should update a symptom mapping via admin', async () => {
      const SymptomMapping = (await import('../models/SymptomMapping.js')).default;
      const mapping = await SymptomMapping.create({
        symptomKeywords: ['headache'],
        services: ['Neurology'],
      });

      const res = await request
        .put(`/admin/symptoms/${mapping._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          symptomKeywords: ['headache', 'migraine'],
          services: ['Neurology', 'Pain Management'],
        });

      expect(res.status).toBe(200);
      expect(res.body.symptomKeywords).toContain('migraine');
      expect(res.body.services).toContain('Pain Management');

      const updated = await SymptomMapping.findById(mapping._id).lean();
      expect(updated.symptomKeywords).toContain('migraine');
    });

    it('should fail to update non-existent mapping', async () => {
      const res = await request
        .put('/admin/symptoms/000000000000000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ symptomKeywords: ['test'] });

      expect(res.status).toBe(404);
    });

    it('should delete a symptom mapping via admin', async () => {
      const SymptomMapping = (await import('../models/SymptomMapping.js')).default;
      const mapping = await SymptomMapping.create({
        symptomKeywords: ['to-delete'],
        services: ['DeleteMe'],
      });

      const res = await request
        .delete(`/admin/symptoms/${mapping._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');

      const found = await SymptomMapping.findById(mapping._id).lean();
      expect(found).toBeNull();
    });

    it('should fail to delete non-existent mapping', async () => {
      const res = await request
        .delete('/admin/symptoms/000000000000000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ── ADMIN GET ALL HOSPITALS ─────────────────────────────
  describe('GET /admin/hospitals', () => {
    it('should return paginated hospitals with metadata', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      // Seed 25 verified hospitals (admin sees all, regardless of verified status)
      const hospitalsData = Array.from({ length: 25 }, (_, i) => ({
        name: `Admin Hospital ${i + 1}`,
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      }));
      await Hospital.insertMany(hospitalsData);

      const res = await request
        .get('/admin/hospitals')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('limit', 20);
      expect(res.body).toHaveProperty('total', 25);
      expect(res.body).toHaveProperty('totalPages', 2);
      expect(Array.isArray(res.body.hospitals)).toBe(true);
      expect(res.body.hospitals.length).toBe(20);
      // Should include verified and unverified? The admin list returns all, so it don't filter by verified.
      // But i inserted only verified. No matter.
    });

    it('should respect custom page and limit', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospitalsData = Array.from({ length: 15 }, (_, i) => ({
        name: `Admin Hospital ${i + 1}`,
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      }));
      await Hospital.insertMany(hospitalsData);

      const res = await request
        .get('/admin/hospitals?page=2&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(5);
      expect(res.body.total).toBe(15);
      expect(res.body.totalPages).toBe(3); // ceil(15/5)=3
      expect(res.body.hospitals.length).toBe(5);
    });

    it('should return empty array for out-of-range page', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      await Hospital.create({
        name: 'Single Admin Hospital',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      });

      const res = await request
        .get('/admin/hospitals?page=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.hospitals).toEqual([]);
    });
  });

  // ── ADMIN CREATE & UPDATE HOSPITAL ─────────────────────
  describe('POST /admin/hospitals and PATCH /admin/hospitals/:id', () => {
    it('should allow admin to create a verified hospital directly', async () => {
      const res = await request
        .post('/admin/hospitals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Admin Created Hospital',
          address: { city: 'Kano', state: 'Nigeria' },
          type: 'General',
          services: ['Cardiology'],
          comments: ['Created by admin'],
          hours: [{ day: 'Monday', open: '9am-5pm' }],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.name).toBe('Admin Created Hospital');
      expect(res.body.verified).toBe(true);

      const Hospital = (await import('../models/Hospital.js')).default;
      const found = await Hospital.findById(res.body._id).lean();
      expect(found.verified).toBe(true);
      expect(found.name).toBe('Admin Created Hospital');
    });

    it('should fail if admin create is missing required fields', async () => {
      const res = await request
        .post('/admin/hospitals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'No Address' }); // missing address.city/state

      expect(res.status).toBe(400);
    });

    it('should allow admin to update a hospital', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      // Create a hospital to update
      const hospital = await Hospital.create({
        name: 'Old Name',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        services: ['general'],
        comments: [],
        hours: [],
        verified: true,
      });

      const res = await request
        .patch(`/admin/hospitals/${hospital._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Admin Name',
          address: { city: 'Abuja', state: 'Nigeria' },
          type: 'Specialist',
          services: ['Neurology', 'Radiology'],
          comments: ['Updated'],
          hours: [{ day: 'Tuesday', open: '8am-4pm' }],
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Admin Name');
      expect(res.body.address.city).toBe('Abuja');
      expect(res.body.services).toContain('Neurology');

      const updated = await Hospital.findById(hospital._id).lean();
      expect(updated.name).toBe('Updated Admin Name');
      expect(updated.verified).toBe(true); // should stay verified unless specifically changed? The admin update doesn't change verification status.
    });

    it('should return 404 when updating non-existent hospital', async () => {
      const res = await request
        .patch('/admin/hospitals/000000000000000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Ghost',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
          services: ['general'],
          comments: [],
          hours: [],
        });

      expect(res.status).toBe(404);
    });
  });
});
