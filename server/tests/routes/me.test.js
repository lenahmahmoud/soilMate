import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { Router } from "express";

let mongod;
let User;
let Farm;
let PlanSet;
let ActivePlan;
let createApp;
let createAuthRouter;
let createMeRouter;

beforeAll(async () => {
  // env.js validates process.env on import, so set everything first (BCRYPT_COST=4 keeps tests fast).
  Object.assign(process.env, {
    PORT: "4000",
    NODE_ENV: "test",
    MONGO_URI: "mongodb://127.0.0.1:27017/soilmate-test",
    CLIENT_ORIGIN: "http://localhost:5173",
    NASA_FEATURE: "false",
    ATTEMPT_TTL_DAYS: "7",
    JWT_SECRET: "test-secret-test-secret-test-secret-1234",
    JWT_EXPIRES_DEFAULT: "1d",
    JWT_EXPIRES_REMEMBER: "30d",
    BCRYPT_COST: "4",
  });
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ default: User } = await import("../../src/models/User.js"));
  ({ default: Farm } = await import("../../src/models/Farm.js"));
  ({ default: PlanSet } = await import("../../src/models/PlanSet.js"));
  ({ default: ActivePlan } = await import("../../src/models/ActivePlan.js"));
  ({ createApp } = await import("../../src/app.js"));
  ({ createAuthRouter } = await import("../../src/routes/authRoutes.js"));
  ({ createMeRouter } = await import("../../src/routes/meRoutes.js"));
  await User.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
});

const buildApp = (meLimits = null) => {
  const router = Router();
  router.use("/auth", createAuthRouter({ limits: null }));
  router.use("/me", createMeRouter({ limits: meLimits }));
  return createApp({ apiRouter: router });
};

const PASSWORD = "Str0ngPass1";

const signup = async (
  app,
  email = "alex@example.com",
  fullName = "Alex Henderson",
) => {
  const res = await request(app).post("/api/auth/signup").send({
    fullName,
    email,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    acceptedTerms: true,
  });
  return res.body; // { token, expiresAt, user }
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const oid = () => new mongoose.Types.ObjectId();

const hasIssue = (res, path) =>
  res.body.error.details.issues.some((i) => i.path === path);

describe("every /me route is private", () => {
  test.each([
    ["get", "/api/me"],
    ["patch", "/api/me"],
    ["post", "/api/me/password"],
    ["delete", "/api/me"],
  ])("%s %s without a token gives 401", async (method, url) => {
    const res = await request(buildApp())[method](url).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("GET /api/me", () => {
  test("returns the profile and never the secret fields", async () => {
    const app = buildApp();
    const { token, user } = await signup(app);
    const res = await request(app).get("/api/me").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      fullName: "Alex Henderson",
      email: "alex@example.com",
      emailVerified: false,
      phone: null,
      avatarUrl: null,
    });
    expect(new Date(res.body.passwordChangedAt).getTime()).not.toBeNaN();
    expect(new Date(res.body.createdAt).getTime()).not.toBeNaN();
    expect(JSON.stringify(res.body)).not.toMatch(
      /passwordHash|tokenVersion|__v/,
    );
  });

  test("each user only sees their own profile", async () => {
    const app = buildApp();
    const a = await signup(app, "a@example.com", "User A");
    const b = await signup(app, "b@example.com", "User B");
    const resA = await request(app).get("/api/me").set(auth(a.token));
    const resB = await request(app).get("/api/me").set(auth(b.token));
    expect(resA.body.email).toBe("a@example.com");
    expect(resB.body.email).toBe("b@example.com");
  });
});

describe("PATCH /api/me", () => {
  test("updates the name (trimmed)", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const res = await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ fullName: "  Alex H.  " });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Alex H.");
  });

  test("normalizes the phone number", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const res = await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ phone: "+1 (555) 382-9104" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("+15553829104");
    const saved = await User.findOne({ email: "alex@example.com" }).lean();
    expect(saved.phone).toBe("+15553829104");
  });

  test("null and an empty string clear the phone", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ phone: "+15553829104" });
    const cleared = await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ phone: null });
    expect(cleared.body.phone).toBeNull();
    await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ phone: "01012345678" });
    const empty = await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ phone: "" });
    expect(empty.body.phone).toBeNull();
  });

  test("updating only the phone keeps the name", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const res = await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ phone: "01012345678" });
    expect(res.body.fullName).toBe("Alex Henderson");
    expect(res.body.phone).toBe("01012345678");
  });

  test("rejects an invalid phone", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    for (const phone of ["12ab", "123", "+1234567890123456", 12345678]) {
      const res = await request(app)
        .patch("/api/me")
        .set(auth(token))
        .send({ phone });
      expect(res.status).toBe(400);
    }
  });

  test("rejects a short name", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const res = await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ fullName: "A" });
    expect(res.status).toBe(400);
    expect(hasIssue(res, "body.fullName")).toBe(true);
  });

  test("email is read-only and unknown keys are rejected", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const email = await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ email: "other@example.com" });
    const extra = await request(app)
      .patch("/api/me")
      .set(auth(token))
      .send({ fullName: "Alex H.", emailVerified: true });
    expect(email.status).toBe(400);
    expect(extra.status).toBe(400);
    const saved = await User.findOne({ email: "alex@example.com" }).lean();
    expect(saved).not.toBeNull();
    expect(saved.emailVerified).toBe(false);
  });

  test("an empty body gives 400", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const res = await request(app).patch("/api/me").set(auth(token)).send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/me/password", () => {
  const body = (over = {}) => ({
    currentPassword: PASSWORD,
    newPassword: "NewPass2024",
    confirmNewPassword: "NewPass2024",
    ...over,
  });

  test("changes the password and returns 204", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const before = await User.findOne({ email: "alex@example.com" }).lean();
    const res = await request(app)
      .post("/api/me/password")
      .set(auth(token))
      .send(body());
    expect(res.status).toBe(204);
    const after = await User.findOne({ email: "alex@example.com" })
      .select("+passwordHash +tokenVersion")
      .lean();
    expect(after.tokenVersion).toBe(1);
    expect(after.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(
      before.passwordChangedAt.getTime(),
    );
    expect(after.passwordHash.startsWith("$2")).toBe(true);
  });

  test("the old token stops working and the new password logs in", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    await request(app).post("/api/me/password").set(auth(token)).send(body());

    const old = await request(app).get("/api/me").set(auth(token));
    expect(old.status).toBe(401);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "alex@example.com", password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "alex@example.com", password: "NewPass2024" });
    expect(newLogin.status).toBe(200);
    const fresh = await request(app)
      .get("/api/me")
      .set(auth(newLogin.body.token));
    expect(fresh.status).toBe(200);
  });

  test("a wrong current password gives 401 and changes nothing", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const res = await request(app)
      .post("/api/me/password")
      .set(auth(token))
      .send(body({ currentPassword: "WrongPass1" }));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    const still = await request(app).get("/api/me").set(auth(token));
    expect(still.status).toBe(200);
  });

  test("rejects a new password equal to the current one", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const res = await request(app)
      .post("/api/me/password")
      .set(auth(token))
      .send(body({ newPassword: PASSWORD, confirmNewPassword: PASSWORD }));
    expect(res.status).toBe(400);
    expect(hasIssue(res, "body.newPassword")).toBe(true);
  });

  test("rejects mismatched confirmation, weak and too-long passwords", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const mismatch = await request(app)
      .post("/api/me/password")
      .set(auth(token))
      .send(body({ confirmNewPassword: "Different1" }));
    const weak = await request(app)
      .post("/api/me/password")
      .set(auth(token))
      .send(body({ newPassword: "short", confirmNewPassword: "short" }));
    const long = `A1${"x".repeat(71)}`;
    const tooLong = await request(app)
      .post("/api/me/password")
      .set(auth(token))
      .send(body({ newPassword: long, confirmNewPassword: long }));
    expect(mismatch.status).toBe(400);
    expect(hasIssue(mismatch, "body.confirmNewPassword")).toBe(true);
    expect(weak.status).toBe(400);
    expect(tooLong.status).toBe(400);
  });

  test("rejects unknown keys", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const res = await request(app)
      .post("/api/me/password")
      .set(auth(token))
      .send({ ...body(), admin: true });
    expect(res.status).toBe(400);
  });

  test("is rate limited when limits are on", async () => {
    const app = buildApp({ password: { limit: 2, windowMs: 60000 } });
    const { token } = await signup(app);
    const wrong = body({ currentPassword: "WrongPass1" });
    await request(app).post("/api/me/password").set(auth(token)).send(wrong);
    await request(app).post("/api/me/password").set(auth(token)).send(wrong);
    const third = await request(app)
      .post("/api/me/password")
      .set(auth(token))
      .send(wrong);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("DELETE /api/me", () => {
  const seedData = async (userId) => {
    await Farm.create({ userId });
    await PlanSet.create({
      userId,
      centerId: "desouk",
      farmSnapshot: { a: 1 },
      status: "placeholder",
      modelVersion: "mock-0.1",
      plans: [{ a: 1 }],
    });
    await ActivePlan.create({
      userId,
      planSetId: oid(),
      planKey: "area_plan_a",
      title: "Improve My Soil",
      startDate: new Date("2026-11-15"),
      status: "placeholder",
      modelVersion: "mock-0.1",
      sequence: [{ slot: "fall_winter", cropId: "winter-rye" }],
    });
  };

  test("a wrong confirmEmail gives 400 and deletes nothing", async () => {
    const app = buildApp();
    const { token, user } = await signup(app);
    await seedData(user.id);
    const res = await request(app)
      .delete("/api/me")
      .set(auth(token))
      .send({ confirmEmail: "other@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(hasIssue(res, "body.confirmEmail")).toBe(true);
    expect(await User.countDocuments()).toBe(1);
    expect(await Farm.countDocuments()).toBe(1);
  });

  test("a missing body gives 400", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    const res = await request(app).delete("/api/me").set(auth(token)).send({});
    expect(res.status).toBe(400);
  });

  test("deletes the user and all their SoilMate data (email match ignores case)", async () => {
    const app = buildApp();
    const { token, user } = await signup(app);
    await seedData(user.id);
    const res = await request(app)
      .delete("/api/me")
      .set(auth(token))
      .send({ confirmEmail: "ALEX@Example.com" });
    expect(res.status).toBe(204);
    expect(await User.countDocuments()).toBe(0);
    expect(await Farm.countDocuments()).toBe(0);
    expect(await PlanSet.countDocuments()).toBe(0);
    expect(await ActivePlan.countDocuments()).toBe(0);
  });

  test("does not touch another user's data", async () => {
    const app = buildApp();
    const a = await signup(app, "a@example.com", "User A");
    const b = await signup(app, "b@example.com", "User B");
    await seedData(a.user.id);
    await seedData(b.user.id);
    await request(app)
      .delete("/api/me")
      .set(auth(a.token))
      .send({ confirmEmail: "a@example.com" });
    expect(await User.countDocuments()).toBe(1);
    expect(await Farm.countDocuments({ userId: b.user.id })).toBe(1);
    expect(await PlanSet.countDocuments({ userId: b.user.id })).toBe(1);
    expect(await ActivePlan.countDocuments({ userId: b.user.id })).toBe(1);
    const stillB = await request(app).get("/api/me").set(auth(b.token));
    expect(stillB.status).toBe(200);
  });

  test("the token stops working after deletion and the email can sign up again", async () => {
    const app = buildApp();
    const { token } = await signup(app);
    await request(app)
      .delete("/api/me")
      .set(auth(token))
      .send({ confirmEmail: "alex@example.com" });
    const after = await request(app).get("/api/me").set(auth(token));
    expect(after.status).toBe(401);
    const again = await signup(app);
    expect(again.user.email).toBe("alex@example.com");
  });
});
