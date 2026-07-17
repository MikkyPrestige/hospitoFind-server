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

  // ── ADMIN DELETE ─────────────────────────────────────────
  describe('DELETE /hospitals/:id', () => {
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
        .delete(`/hospitals/${hospitalId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toContain('permanently removed');

      const Hospital = (await import('../models/Hospital.js')).default;
      const found = await Hospital.findById(hospitalId).lean();
      expect(found).toBeNull();
    });

    it('should fail with 404 for non-existent hospital', async () => {
      const res = await request
        .delete('/hospitals/000000000000000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ── ADMIN APPROVE ────────────────────────────────────────
  describe('PATCH /hospitals/approve/:id', () => {
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
      expect(submitRes.body.hospital.verified).toBe(false);

      const approveRes = await request
        .patch(`/hospitals/approve/${hospitalId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.message).toContain('verified and live');

      const Hospital = (await import('../models/Hospital.js')).default;
      const found = await Hospital.findById(hospitalId).lean();
      expect(found.verified).toBe(true);
    });

    it('should fail with 404 for non-existent hospital', async () => {
      const res = await request
        .patch('/hospitals/approve/000000000000000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
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
    it('should return only unverified hospitals', async () => {
      const subRes = await request
        .post('/hospitals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Pending Hospital',
          address: { city: 'Lagos', state: 'Nigeria' },
          type: 'General',
        });

      expect(subRes.status).toBe(201);
      expect(subRes.body.hospital).toBeDefined();

      // Create a verified hospital directly in the DB
      const Hospital = (await import('../models/Hospital.js')).default;
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

      const res = await request
        .get('/admin/hospitals/pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Pending Hospital');
      expect(res.body[0].verified).toBe(false);
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

  // ── ADMIN USER CRUD ──────────────────────────────────────
  describe('Admin User Management', () => {
    describe('GET /admin/users', () => {
      it('should list all users', async () => {
        const res = await request.get('/admin/users').set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(2);
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
});
