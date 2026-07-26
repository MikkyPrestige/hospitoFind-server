process.env.GROQ_API_KEY = 'test';

import { jest } from '@jest/globals';
import supertest from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper.mjs';
import User from '../models/User.js';
import Hospital from '../models/Hospital.js';
import MatchFeedback from '../models/MatchFeedback.js';

jest.setTimeout(30000);

// Mock geocode to avoid Mapbox dependency
jest.unstable_mockModule('../utils/geocode.js', () => ({
  getCoordinates: jest.fn().mockResolvedValue({ longitude: 3.3792, latitude: 6.5244 }),
}));

const { default: app } = await import('../app.js');

let request;
let userToken;
let regularUserId;
let testHospitalId;

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
  await clearTestDB();
  await User.deleteMany({});
  await Hospital.deleteMany({});
  await MatchFeedback.deleteMany({});

  const suffix = Date.now();

  // Create a regular user
  const regularUser = await User.create({
    name: 'Feedback User',
    username: `feedbackuser_${suffix}`,
    email: `feedback_${suffix}@test.com`,
    password: await bcrypt.hash('password123', 10),
    role: 'user',
    isVerified: true,
  });
  regularUserId = regularUser._id.toString();
  userToken = generateTestToken(regularUser);

  // Create a test hospital for feedback
  const hospital = await Hospital.create({
    name: 'Feedback Test Hospital',
    address: { city: 'Lagos', state: 'Nigeria' },
    type: 'General',
    verified: true,
    services: ['general'],
    comments: [],
    hours: [],
  });
  testHospitalId = hospital._id.toString();
}, 30000);

afterAll(async () => {
  await disconnectTestDB();
});

describe('POST /api/v1/user/match-feedback', () => {
  it('should record thumbs up feedback', async () => {
    const res = await request
      .post('/api/v1/user/match-feedback')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ hospitalId: testHospitalId, rating: 'up' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Feedback recorded: up');
    expect(res.body.feedback.rating).toBe('up');
    expect(res.body.feedback.hospitalId).toBe(testHospitalId);
    expect(res.body.feedback.id).toBeDefined();

    // Verify in DB
    const feedback = await MatchFeedback.findOne({
      userId: regularUserId,
      hospitalId: testHospitalId,
    });
    expect(feedback).not.toBeNull();
    expect(feedback.rating).toBe('up');
  });

  it('should upsert feedback (change rating) for same user-hospital', async () => {
    // First submit 'up'
    await request
      .post('/api/v1/user/match-feedback')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ hospitalId: testHospitalId, rating: 'up' });

    // Submit again with 'down'
    const res = await request
      .post('/api/v1/user/match-feedback')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ hospitalId: testHospitalId, rating: 'down' });

    expect(res.status).toBe(200);
    expect(res.body.feedback.rating).toBe('down');

    // Should still be only one document
    const feedbacks = await MatchFeedback.find({
      userId: regularUserId,
      hospitalId: testHospitalId,
    });
    expect(feedbacks.length).toBe(1);
    expect(feedbacks[0].rating).toBe('down');
  });

  it('should allow optional matchId', async () => {
    const res = await request
      .post('/api/v1/user/match-feedback')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ hospitalId: testHospitalId, rating: 'up', matchId: 'session_123' });

    expect(res.status).toBe(200);
    const feedback = await MatchFeedback.findById(res.body.feedback.id);
    expect(feedback.matchId).toBe('session_123');
  });

  it('should return 400 for invalid rating', async () => {
    const res = await request
      .post('/api/v1/user/match-feedback')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ hospitalId: testHospitalId, rating: 'bad' });

    expect(res.status).toBe(400);
  });

  it('should return 400 for missing hospitalId', async () => {
    const res = await request
      .post('/api/v1/user/match-feedback')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 'up' });

    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent hospital', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request
      .post('/api/v1/user/match-feedback')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ hospitalId: fakeId, rating: 'up' });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Hospital not found');
  });

  it('should require authentication', async () => {
    const res = await request
      .post('/api/v1/user/match-feedback')
      .send({ hospitalId: testHospitalId, rating: 'up' });

    expect(res.status).toBe(401);
  });
});
