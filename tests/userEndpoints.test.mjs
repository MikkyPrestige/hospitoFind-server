// tests/userEndpoints.test.mjs
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
let regularUsername;

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
  regularUsername = regularUser.username;
  regularUserId = regularUser._id.toString();
  userToken = generateTestToken(regularUser);
}, 30000);

afterAll(async () => {
  await disconnectTestDB();
});

describe('User Self-Service Endpoints', () => {
  describe('GET /api/user/stats', () => {
    it('should return user submission stats', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      await Hospital.create({
        name: 'User Verified',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
        createdBy: new mongoose.Types.ObjectId(regularUserId),
      });
      await Hospital.create({
        name: 'User Pending',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: false,
        services: ['general'],
        comments: [],
        hours: [],
        createdBy: new mongoose.Types.ObjectId(regularUserId),
      });

      const res = await request
        .get('/api/v1/user/stats')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalSubmissions).toBe(2);
      expect(res.body.verifiedSubmissions).toBe(1);
      expect(res.body.pendingSubmissions).toBe(1);
      expect(res.body.contributorLevel).toBeDefined();
    });
  });

  describe('GET /api/v1/user/activity', () => {
    it('should return favorites and recently viewed', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      // Create two hospitals
      const hospital1 = await Hospital.create({
        name: 'Activity Hospital 1',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      });
      const hospital2 = await Hospital.create({
        name: 'Activity Hospital 2',
        address: { city: 'Abuja', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      });

      // Add favorites and recently viewed to the user
      await User.findByIdAndUpdate(regularUserId, {
        $addToSet: { favorites: [hospital1._id, hospital2._id] },
        $push: {
          recentlyViewed: {
            $each: [
              { hospital: hospital1._id, viewedAt: new Date() },
              { hospital: hospital2._id, viewedAt: new Date() },
            ],
          },
        },
      });

      const res = await request
        .get('/api/v1/user/activity')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.favorites).toBeDefined();
      expect(res.body.favorites.length).toBe(2);
      expect(res.body.recentlyViewed).toBeDefined();
      expect(res.body.recentlyViewed.length).toBe(2);
      expect(res.body.weeklyViews).toBeDefined();
    });
  });

  describe('PATCH /api/v1/user', () => {
    it('should update user name and email with password confirmation', async () => {
      const res = await request
        .patch('/api/v1/user')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          username: regularUsername,
          name: 'Updated Name',
          email: `updated_${Date.now()}@test.com`,
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');

      const updatedUser = await User.findById(regularUserId).lean();
      expect(updatedUser.name).toBe('Updated Name');
    });

    it('should fail with 400 if password is missing', async () => {
      const res = await request
        .patch('/api/v1/user')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ username: regularUsername, name: 'No Password' });

      expect(res.status).toBe(400);
    });

    it('should fail with 400 if password is wrong', async () => {
      const res = await request
        .patch('/api/v1/user')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          username: regularUsername,
          password: 'wrongpassword',
          name: 'Hacker',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid password');
    });
  });

  describe('POST /api/v1/user/view', () => {
    it('should record a hospital view', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospital = await Hospital.create({
        name: 'View Test Hospital',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      });

      const res = await request
        .post('/api/v1/user/view')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ hospitalId: hospital._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('View recorded');

      const user = await User.findById(regularUserId).lean();
      expect(user.recentlyViewed.length).toBe(1);
      expect(user.recentlyViewed[0].hospital.toString()).toBe(hospital._id.toString());
      expect(user.weeklyViewCount).toBe(1);
    });
  });

  describe('POST /api/v1/user/favorites-status/:hospitalId', () => {
    it('should toggle favorite status on and off', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospital = await Hospital.create({
        name: 'Fav Test Hospital',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      });

      // Add to favorites
      const res1 = await request
        .post(`/api/v1/user/favorites-status/${hospital._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.isFavorite).toBe(true);
      expect(res1.body.message).toContain('Added to favorites');

      let user = await User.findById(regularUserId).lean();
      expect(user.favorites.map(String)).toContain(hospital._id.toString());

      // Remove from favorites
      const res2 = await request
        .post(`/api/v1/user/favorites-status/${hospital._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res2.status).toBe(200);
      expect(res2.body.isFavorite).toBe(false);
      expect(res2.body.message).toContain('Removed from favorites');

      user = await User.findById(regularUserId).lean();
      expect(user.favorites.length).toBe(0);
    });
  });

  describe('DELETE /api/v1/user/favorites/:hospitalId', () => {
    it('should remove a specific favorite', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospital = await Hospital.create({
        name: 'Remove Fav Hospital',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      });

      // First add to favorites manually
      await User.findByIdAndUpdate(regularUserId, { $addToSet: { favorites: hospital._id } });

      const res = await request
        .delete(`/api/v1/user/favorites/${hospital._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Removed from favorites');

      const user = await User.findById(regularUserId).lean();
      expect(user.favorites.length).toBe(0);
    });
  });

  describe('DELETE /api/v1/user/history/:hospitalId', () => {
    it('should remove a specific history item', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospital = await Hospital.create({
        name: 'Remove History Hospital',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      });

      // Add to recently viewed manually
      await User.findByIdAndUpdate(regularUserId, {
        $push: { recentlyViewed: { hospital: hospital._id, viewedAt: new Date() } },
      });

      const res = await request
        .delete(`/api/v1/user/history/${hospital._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Removed from history');

      const user = await User.findById(regularUserId).lean();
      expect(user.recentlyViewed.length).toBe(0);
    });
  });

  describe('DELETE /api/v1/user/history', () => {
    it('should clear all history', async () => {
      const Hospital = (await import('../models/Hospital.js')).default;
      const hospital1 = await Hospital.create({
        name: 'History 1',
        address: { city: 'Lagos', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      });
      const hospital2 = await Hospital.create({
        name: 'History 2',
        address: { city: 'Abuja', state: 'Nigeria' },
        type: 'General',
        verified: true,
        services: ['general'],
        comments: [],
        hours: [],
      });

      await User.findByIdAndUpdate(regularUserId, {
        $set: {
          recentlyViewed: [
            { hospital: hospital1._id, viewedAt: new Date() },
            { hospital: hospital2._id, viewedAt: new Date() },
          ],
        },
      });

      const res = await request
        .delete('/api/v1/user/history')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('History cleared');

      const user = await User.findById(regularUserId).lean();
      expect(user.recentlyViewed.length).toBe(0);
    });
  });

  describe('PATCH /api/v1/user/password', () => {
    it('should update password when current password is correct', async () => {
      const res = await request
        .patch('/api/v1/user/password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          username: regularUsername,
          password: 'password123',
          newPassword: 'newSecurePassword456',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Password updated successfully');

      // Verify we can't login with old password, but that's auth tests; at least check hash changed
      const user = await User.findById(regularUserId).select('password').lean();
      const isOldMatch = await bcrypt.compare('password123', user.password);
      expect(isOldMatch).toBe(false);
      const isNewMatch = await bcrypt.compare('newSecurePassword456', user.password);
      expect(isNewMatch).toBe(true);
    });

    it('should fail with 400 if current password is wrong', async () => {
      const res = await request
        .patch('/api/v1/user/password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          username: regularUsername,
          password: 'wrongpassword',
          newPassword: 'newpass',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid current password');
    });

    it('should fail with 400 if fields are missing', async () => {
      const res = await request
        .patch('/api/v1/user/password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ username: regularUsername });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/user', () => {
    it('should delete user account with correct password', async () => {
      const res = await request
        .delete('/api/v1/user')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          username: regularUsername,
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');

      // Verify user is removed from DB
      const user = await User.findById(regularUserId).lean();
      expect(user).toBeNull();
    });

    it('should fail with 400 if password is wrong', async () => {
      const res = await request
        .delete('/api/v1/user')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          username: regularUsername,
          password: 'wrongpassword',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Incorrect password');
    });

    it('should fail with 400 if password is missing', async () => {
      const res = await request
        .delete('/api/v1/user')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ username: regularUsername });

      expect(res.status).toBe(400);
    });
  });

  describe('TOTP Management', () => {
    // We'll mock totpHelpers to control the secret/code
    jest.unstable_mockModule('../utils/totpHelpers.js', () => ({
      generateTotpSecret: jest.fn().mockReturnValue({
        secret: 'MOCKEDSECRET123',
        otpauthUrl: 'otpauth://totp/HospitoFind:testuser?secret=MOCKEDSECRET123',
      }),
      generateQRCode: jest.fn().mockResolvedValue('data:image/png;base64,MOCKQRCODE'),
      verifyTotpCode: jest.fn().mockReturnValue(true), // always valid for test
      encryptSecret: jest.fn().mockReturnValue('encrypted_mock_secret'),
      decryptSecret: jest.fn().mockReturnValue('MOCKEDSECRET123'),
      generateRecoveryCodes: jest
        .fn()
        .mockReturnValue(['code1', 'code2', 'code3', 'code4', 'code5', 'code6', 'code7', 'code8']),
      hashRecoveryCode: jest.fn().mockReturnValue('hashed_code'),
    }));

    it('should setup TOTP and return QR code', async () => {
      const res = await request
        .post('/api/v1/user/totp/setup')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.qrCode).toBeDefined();
      expect(res.body.setupToken).toBeDefined();
      expect(res.body.message).toContain('Scan the QR code');
    });

    it('should fail to verify TOTP with invalid setup token', async () => {
      const res = await request
        .post('/api/v1/user/totp/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ setupToken: 'invalid', code: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('expired or invalid');
    });
  });
});
