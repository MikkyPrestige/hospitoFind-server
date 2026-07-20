import { jest } from '@jest/globals';
import supertest from 'supertest';
import * as jose from 'jose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper.mjs';

// Mock the entire jwks-rsa module to be able to control getSigningKey
let mockPublicKeyPem;

jest.unstable_mockModule('jwks-rsa', () => ({
  JwksClient: jest.fn().mockImplementation(() => ({
    getSigningKey: jest.fn().mockImplementation(async (kid, cb) => {
      if (!mockPublicKeyPem) {
        return cb(new Error('No public key set'));
      }
      cb(null, {
        getPublicKey: () => mockPublicKeyPem,
        rsaPublicKey: mockPublicKeyPem,
      });
    }),
  })),
}));

// After the mock, import app
const { default: app } = await import('../app.js');

let request;

beforeAll(async () => {
  await connectTestDB();
  request = supertest(app);
}, 60000);

beforeEach(async () => {
  await User.deleteMany({});
  await clearTestDB();
  // Reset mock key for each test
  mockPublicKeyPem = null;
}, 30000);

afterAll(async () => {
  await disconnectTestDB();
});

describe('Auth0 login with JWKS', () => {
  it('should verify a valid token and create a new user', async () => {
    // 1. Generate a key pair (RS256)
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
    mockPublicKeyPem = await jose.exportSPKI(publicKey);

    // 2. Create a signed JWT with claims that match what the controller expects
    const jwt = await new jose.SignJWT({
      email: 'auth0user@example.com',
      name: 'Auth0 Test User',
      nickname: 'auth0user',
      sub: 'auth0|123',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'testkid' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setIssuer(process.env.AUTH0_ISSUER)
      .setAudience(process.env.AUTH0_AUDIENCE)
      .sign(privateKey);

    // 3. Call the endpoint with the raw JWT
    const res = await request.post('/auth/auth0').send({
      email: 'auth0user@example.com',
      name: 'Auth0 Test User',
      username: 'auth0user',
      idToken: jwt,
    });

    // 4. Assert success
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.username).toBe('auth0user');
    expect(res.body.auth0Id).toBe('auth0|123');

    // 5. Verify the user document was created
    const user = await User.findOne({ email: 'auth0user@example.com' });
    expect(user).not.toBeNull();
    expect(user.auth0Id).toBe('auth0|123');
    expect(user.isVerified).toBe(true);
  });

  it('should update an existing user if email already exists', async () => {
    // Pre‑create a user manually
    const existing = await User.create({
      name: 'Old Name',
      username: 'olduser',
      email: 'auth0user@example.com',
      password: await bcrypt.hash('dummypass', 10),
      role: 'user',
      isVerified: false,
    });

    // Re‑run the same token flow
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
    mockPublicKeyPem = await jose.exportSPKI(publicKey);

    const jwt = await new jose.SignJWT({
      email: 'auth0user@example.com',
      name: 'Auth0 Updated User',
      nickname: 'auth0user',
      sub: 'auth0|456',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'testkid' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setIssuer(process.env.AUTH0_ISSUER)
      .setAudience(process.env.AUTH0_AUDIENCE)
      .sign(privateKey);

    const res = await request.post('/auth/auth0').send({
      email: 'auth0user@example.com',
      name: 'Auth0 Updated User',
      username: 'auth0user',
      idToken: jwt,
    });

    expect(res.status).toBe(200);
    expect(res.body.auth0Id).toBe('auth0|456');
    expect(res.body.name).toBe('Old Name');

    const user = await User.findById(existing._id);
    expect(user.auth0Id).toBe('auth0|456');
    expect(user.name).toBe('Old Name');
    expect(user.isVerified).toBe(true);
  });
});
