import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import supertest from "supertest";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import app from "../app.js";

let mongoServer;
let request;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  request = supertest(app);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

const createTestUser = async () => {
  const hashedPassword = await bcrypt.hash("testpassword", 10);
  return User.create({
    name: "Test User",
    username: "testuser",
    email: "test@example.com",
    password: hashedPassword,
    role: "user",
    isVerified: true,
  });
};

describe("Auth – login and refresh token", () => {
  it("should login and return access token + set refresh cookie", async () => {
    await createTestUser();

    const res = await request.post("/auth").send({
      email: "test@example.com",
      password: "testpassword",
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.headers["set-cookie"][0]).toMatch(/^jwt=/);
  });

  it("should fail login with wrong password", async () => {
    await createTestUser();

    const res = await request.post("/auth").send({
      email: "test@example.com",
      password: "wrongpassword",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("should return new access token on refresh with valid cookie", async () => {
    await createTestUser();

    const loginRes = await request.post("/auth").send({
      email: "test@example.com",
      password: "testpassword",
    });

    const cookies = loginRes.headers["set-cookie"];
    const jwtCookie = cookies.find((c) => c.startsWith("jwt="));

    const refreshRes = await request
      .get("/auth/refresh")
      .set("Cookie", jwtCookie);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.role).toBe("user");
  });

  it("should fail refresh with no cookie", async () => {
    const res = await request.get("/auth/refresh");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("No refresh token");
  });

  it("should fail refresh with invalid cookie", async () => {
    const res = await request
      .get("/auth/refresh")
      .set("Cookie", "jwt=invalidtoken");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Token Expired or Invalid");
  });
});
