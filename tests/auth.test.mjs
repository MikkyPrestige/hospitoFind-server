import { jest } from '@jest/globals';
jest.setTimeout(30000);
import supertest from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import app from '../app.js';
import { connectTestDB, clearTestDB } from './dbHelper.mjs';

let request;

beforeAll(async () => {
  await connectTestDB();
  request = supertest(app);
}, 60000);

beforeEach(async () => {
  await clearTestDB();
}, 60000);

const createTestUser = async () => {
  const hashedPassword = await bcrypt.hash('testpassword', 10);
  return User.create({
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    password: hashedPassword,
    role: 'user',
    isVerified: true,
  });
};

describe('Auth – login and refresh token', () => {
  it('should login and return access token + set refresh cookie', async () => {
    await createTestUser();

    const res = await request.post('/auth').send({
      email: 'test@example.com',
      password: 'testpassword',
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/^jwt=/);
  });

  it('should fail login with wrong password', async () => {
    await createTestUser();

    const res = await request.post('/auth').send({
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('should return new access token on refresh with a valid token', async () => {
    // Generate tokens manually to avoid cookie‑extraction issues
    const user = await User.findOne({ email: 'test@example.com' });
    const refreshToken = jwt.sign(
      { username: user.username, family: 'test-family', jti: 'test-jti' },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '7d' },
    );

    // Set the refresh token cookie manually
    const res = await request.get('/auth/refresh').set('Cookie', `jwt=${refreshToken}`);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.role).toBe('user');
  });

  it('should fail refresh with no cookie', async () => {
    const res = await request.get('/auth/refresh');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No refresh token');
  });

  it('should fail refresh with invalid cookie', async () => {
    const res = await request.get('/auth/refresh').set('Cookie', 'jwt=invalidtoken');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Token Expired or Invalid');
  });
});
