import request from "supertest";
import { jest } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";
import { startTestApp } from "../helpers/testApp.js";
import { createClient, keysFor } from "../helpers/play.js";
import { GAME_SLUGS } from "../../src/constants/enums.js";
import { env } from "../../src/config/env.js";
import Attempt from "../../src/models/Attempt.js";
import Player from "../../src/models/Player.js";
import Progress from "../../src/models/Progress.js";
import Question from "../../src/models/Question.js";
import QuestionHistory from "../../src/models/QuestionHistory.js";

jest.setTimeout(30000);

let ctx;

beforeAll(async () => {
  ctx = await startTestApp();
}, 60000);

afterAll(async () => {
  await ctx.stop();
});

afterEach(async () => {
  await Promise.all([
    Attempt.deleteMany({}),
    QuestionHistory.deleteMany({}),
    Progress.deleteMany({}),
    Player.deleteMany({}),
  ]);
});

const newClient = () => createClient(ctx.app, uuidv4());
const sorted = (list) => [...list].sort();

const LEAKY_KEYS = [
  "correctChoiceKey",
  "explanation",
  "collectionItem",
  "illustrationFixedKey",
  "resultAnimationKey",
];

function expectNoLeakyKeys(body) {
  const text = JSON.stringify(body);
  for (const key of LEAKY_KEYS) {
    expect(text).not.toMatch(new RegExp(`"${key}"\\s*:`));
  }
}

describe("nothing secret leaves before a question is resolved", () => {
  test("start and resume never contain answers, explanations or scene keys (all 5 games)", async () => {
    const client = newClient();
    for (const slug of GAME_SLUGS) {
      const started = await client.start(slug);
      expect(started.status).toBe(201);
      expectNoLeakyKeys(started.body);

      const { wrong } = await keysFor(started.body.questions[0]);
      await client.answer(
        started.body.attemptId,
        started.body.questions[0].id,
        wrong[0],
      );

      const resumed = await client.resume(slug);
      expect(resumed.status).toBe(200);
      expectNoLeakyKeys(resumed.body);
    }
  });

  test("a wrong answer never leaks anything (all 5 games)", async () => {
    const client = newClient();
    for (const slug of GAME_SLUGS) {
      const started = await client.start(slug);
      const { wrong } = await keysFor(started.body.questions[0]);
      const res = await client.answer(
        started.body.attemptId,
        started.body.questions[0].id,
        wrong[0],
      );
      expect(res.status).toBe(200);
      expectNoLeakyKeys(res.body);
    }
  });

  test("skip reveals the answer and explanation but no collection item or scene keys", async () => {
    const client = newClient();
    for (const slug of [
      "fix-the-field",
      "weather-and-crops",
      "crop-superpowers",
    ]) {
      const started = await client.start(slug);
      const res = await client.skip(
        started.body.attemptId,
        started.body.questions[0].id,
      );
      expect(res.status).toBe(200);
      expect(sorted(Object.keys(res.body))).toEqual(
        sorted([
          "correctChoiceKey",
          "explanation",
          "hearts",
          "streak",
          "totalPoints",
          "attemptStatus",
          "allResolved",
        ]),
      );
    }
  });

  test("Question.correctChoiceKey and explanation are select: false", async () => {
    const q = await Question.findOne().lean();
    expect(q).toBeTruthy();
    expect(q.correctChoiceKey).toBeUndefined();
    expect(q.explanation).toBeUndefined();
  });
});

describe("privacy", () => {
  test("a player document holds only the random id and timestamps", async () => {
    const client = newClient();
    await client.start("crop-superpowers");
    const player = await Player.findById(client.playerId).lean();
    expect(player).toBeTruthy();
    const allowed = ["_id", "lastSeenAt", "createdAt", "updatedAt", "__v"];
    expect(Object.keys(player).filter((k) => !allowed.includes(k))).toEqual([]);
  });

  test("no IP address is stored on attempts or players", async () => {
    const client = newClient();
    await client.start("crop-superpowers");
    const text = JSON.stringify([
      await Attempt.find().lean(),
      await Player.find().lean(),
    ]);
    expect(text).not.toMatch(/127\.0\.0\.1|::ffff|::1/);
  });
});

describe("transport and hardening", () => {
  test("helmet headers are present", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  test("CORS only ever allows the configured origin and exposes X-Player-Id", async () => {
    const allowed = await request(ctx.app)
      .get("/api/health")
      .set("Origin", env.CLIENT_ORIGIN);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      env.CLIENT_ORIGIN,
    );
    expect(allowed.headers["access-control-expose-headers"]).toMatch(
      /X-Player-Id/i,
    );

    const evil = await request(ctx.app)
      .get("/api/health")
      .set("Origin", "https://evil.example.com");
    // The server never echoes a foreign origin, so the browser blocks the response.
    expect(evil.headers["access-control-allow-origin"]).not.toBe(
      "https://evil.example.com",
    );
    expect(evil.headers["access-control-allow-origin"]).not.toBe("*");
    expect(evil.headers["access-control-allow-origin"]).toBe(env.CLIENT_ORIGIN);
  });

  test("attempt endpoints send Cache-Control: no-store", async () => {
    const client = newClient();
    const started = await client.start("crop-superpowers");
    expect(started.headers["cache-control"]).toBe("no-store");
    expect(
      (await client.resume("crop-superpowers")).headers["cache-control"],
    ).toBe("no-store");
  });

  test("errors use one safe shape and never show stacks or database details", async () => {
    const client = newClient();
    const responses = [
      await request(ctx.app).get("/api/does-not-exist"),
      await client.answer("abc", "abc", "a"),
      await client.resume("crop-superpowers"),
      await request(ctx.app)
        .post("/api/attempts/507f1f77bcf86cd799439011/answer")
        .set("X-Player-Id", client.playerId)
        .set("Content-Type", "application/json")
        .send('{"broken json'),
    ];

    for (const res of responses) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(Object.keys(res.body)).toEqual(["error"]);
      expect(res.body.error.code).toEqual(expect.any(String));
      expect(res.body.error.message).toEqual(expect.any(String));
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(
        /stack|node_modules|MongoServerError|CastError|at .*\.js/i,
      );
    }
  });

  test("a body over 10kb is rejected with the standard error shape", async () => {
    const client = newClient();
    const res = await request(ctx.app)
      .post("/api/attempts/507f1f77bcf86cd799439011/answer")
      .set("X-Player-Id", client.playerId)
      .send({ questionId: "x", choiceKey: "a".repeat(20000) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("expiry", () => {
  test("Attempt has a TTL index on expiresAt with expireAfterSeconds 0", async () => {
    await Attempt.init();
    const indexes = await Attempt.collection.indexes();
    const ttl = indexes.find((i) => i.key && i.key.expiresAt === 1);
    expect(ttl).toBeTruthy();
    expect(ttl.expireAfterSeconds).toBe(0);
  });
});
