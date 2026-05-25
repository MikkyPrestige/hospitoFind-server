import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import supertest from "supertest";

// 1. Mock Groq before importing the app
const mockCreate = jest.fn();
jest.unstable_mockModule("groq-sdk", () => ({
  default: jest.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

// 2. Dynamically import the app AFTER the mock
const { default: app } = await import("../app.js");

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

beforeEach(() => {
  mockCreate.mockReset();
});

describe("POST /agent/chat", () => {
  it("returns a normal AI text message", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "What symptoms are you experiencing?",
          },
        },
      ],
    });

    const res = await request.post("/agent/chat").send({
      messages: [{ role: "user", content: "I need help" }],
    });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("MESSAGE");
    expect(res.body.message).toBe("What symptoms are you experiencing?");
  });

  it("returns MATCH_READY when AI triggers a match", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              '{"action":"MATCH","symptoms":["headache"],"location":"Lagos","additionalNeeds":""}',
          },
        },
      ],
    });

    const res = await request.post("/agent/chat").send({
      messages: [
        { role: "user", content: "I have a headache and I'm in Lagos" },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("MATCH_READY");
    expect(res.body.profile.symptoms).toContain("headache");
    expect(res.body.profile.location).toBe("Lagos");
  });
});
