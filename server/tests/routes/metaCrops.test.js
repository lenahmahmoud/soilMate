import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { Router } from "express";

const BASE = "https://api.test.local";
const IMAGES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/crops",
);
const TEST_IMAGE = path.join(IMAGES_DIR, "__test-image.webp");

let mongod;
let Player;
let OPTIONS;
let createApp;
let metaRoutes;
let cropsRoutes;

beforeAll(async () => {
  // env.js validates process.env on import, so set everything first.
  Object.assign(process.env, {
    PORT: "4000",
    NODE_ENV: "test",
    MONGO_URI: "mongodb://127.0.0.1:27017/soilmate-test",
    CLIENT_ORIGIN: "http://localhost:5173",
    NASA_FEATURE: "false",
    ATTEMPT_TTL_DAYS: "7",
    JWT_SECRET: "test-secret-test-secret-test-secret-1234",
    BCRYPT_COST: "4",
    PUBLIC_BASE_URL: BASE,
  });
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ default: Player } = await import("../../src/models/Player.js"));
  ({ OPTIONS } = await import("../../src/constants/options.js"));
  ({ createApp } = await import("../../src/app.js"));
  ({ default: metaRoutes } = await import("../../src/routes/metaRoutes.js"));
  ({ default: cropsRoutes } = await import("../../src/routes/cropsRoutes.js"));

  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.writeFileSync(TEST_IMAGE, Buffer.from([0x52, 0x49, 0x46, 0x46]));
}, 60000);

afterAll(async () => {
  fs.rmSync(TEST_IMAGE, { force: true });
  await mongoose.disconnect();
  await mongod.stop();
});

const buildApp = () => {
  const router = Router();
  router.use("/meta", metaRoutes);
  router.use("/crops", cropsRoutes);
  return createApp({ apiRouter: router });
};

const idsOf = (res) => res.body.crops.map((c) => c.id);
const hasIssue = (res, p) =>
  res.body.error.details.issues.some((i) => i.path === p);

describe("GET /api/meta/options", () => {
  test("is public and returns the options object", async () => {
    const res = await request(buildApp()).get("/api/meta/options");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(OPTIONS)));
    expect(res.body.waterSource).toHaveLength(5);
    expect(res.body.limits.maxPriorities).toBe(3);
  });

  test("is cacheable for one hour", async () => {
    const res = await request(buildApp()).get("/api/meta/options");
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
  });

  test("has the two seasons (C3)", async () => {
    const res = await request(buildApp()).get("/api/meta/options");
    expect(res.body.seasons).toEqual([
      { id: "winter", label: "Winter", order: 1 },
      { id: "summer", label: "Summer", order: 2 },
    ]);
  });

  test("does not create a game player", async () => {
    await request(buildApp()).get("/api/meta/options");
    expect(await Player.countDocuments()).toBe(0);
  });
});

describe("GET /api/crops (in memory, no database)", () => {
  test("default (use=rotation): the 7 crops in catalog order, then fallow", async () => {
    const res = await request(buildApp()).get("/api/crops");
    expect(res.status).toBe(200);
    expect(idsOf(res)).toEqual([
      "wheat",
      "faba_bean",
      "berseem",
      "sugar_beet",
      "cotton",
      "rice",
      "maize",
      "fallow",
    ]);
  });

  test("is public and never creates a player (the crops collection does not even exist)", async () => {
    const res = await request(buildApp()).get("/api/crops");
    expect(res.status).toBe(200);
    expect(await Player.countDocuments()).toBe(0);
    // The old Crop model still exists until Phase 3, so Mongoose may create an empty collection.
    // What matters: /api/crops works with no crop documents in the database.
    expect(
      await mongoose.connection.db.collection("crops").countDocuments(),
    ).toBe(0);
  });

  test("has exactly the contract fields and never the traits or appId", async () => {
    const res = await request(buildApp()).get("/api/crops");
    for (const crop of res.body.crops) {
      expect(Object.keys(crop).sort()).toEqual([
        "description",
        "id",
        "image",
        "name",
        "roleTags",
        "season",
      ]);
      expect(Object.keys(crop.image).sort()).toEqual([
        "alt",
        "thumbUrl",
        "url",
      ]);
    }
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(
      /appId|app_id|nitrogen_fixing|salinity_tolerance|season_length_days|kc|economic_value|relative_income/,
    );
    expect(text).not.toMatch(/"slots"|"slot"|selectableAsCurrent|roleTag"/);
  });

  test("builds absolute image URLs from the crop id (the JSON has image: null)", async () => {
    const res = await request(buildApp()).get("/api/crops");
    const wheat = res.body.crops.find((c) => c.id === "wheat");
    expect(wheat.image).toEqual({
      url: `${BASE}/static/crops/wheat.webp`,
      thumbUrl: `${BASE}/static/crops/thumb/wheat.webp`,
      alt: "Wheat",
    });
    const fallow = res.body.crops.find((c) => c.id === "fallow");
    expect(fallow).toMatchObject({
      name: "No crop this season",
      season: "any",
      roleTags: [],
    });
  });

  test("use=current: the 7 crops without fallow", async () => {
    const res = await request(buildApp()).get("/api/crops?use=current");
    expect(idsOf(res)).toEqual([
      "wheat",
      "faba_bean",
      "berseem",
      "sugar_beet",
      "cotton",
      "rice",
      "maize",
    ]);
  });

  test("season filters, and fallow comes back only for use=rotation", async () => {
    const app = buildApp();
    const w = await request(app).get("/api/crops?season=winter");
    const s = await request(app).get("/api/crops?season=summer");
    const wc = await request(app).get("/api/crops?use=current&season=winter");
    const sc = await request(app).get("/api/crops?use=current&season=summer");
    expect(idsOf(w)).toEqual([
      "wheat",
      "faba_bean",
      "berseem",
      "sugar_beet",
      "fallow",
    ]);
    expect(idsOf(s)).toEqual(["cotton", "rice", "maize", "fallow"]);
    expect(idsOf(wc)).toEqual(["wheat", "faba_bean", "berseem", "sugar_beet"]);
    expect(idsOf(sc)).toEqual(["cotton", "rice", "maize"]);
  });

  test("is cacheable for one hour with an ETag", async () => {
    const res = await request(buildApp()).get("/api/crops");
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.headers.etag).toBeTruthy();
  });

  test("rejects slot (retired), unknown use, unknown season and unknown keys", async () => {
    const app = buildApp();
    const slot = await request(app).get("/api/crops?slot=spring");
    const badUse = await request(app).get("/api/crops?use=everything");
    const badSeason = await request(app).get("/api/crops?season=spring");
    const emptySeason = await request(app).get("/api/crops?season=");
    const extra = await request(app).get("/api/crops?color=green");
    for (const r of [slot, badUse, badSeason, emptySeason, extra]) {
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(hasIssue(badUse, "query.use")).toBe(true);
    expect(hasIssue(badSeason, "query.season")).toBe(true);
  });
});

describe("GET /static (crop images)", () => {
  test("serves a file with a 7-day cache and cross-origin permission", async () => {
    const res = await request(buildApp()).get(
      "/static/crops/__test-image.webp",
    );
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/max-age=604800/);
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  test("a missing image gives the standard 404", async () => {
    const res = await request(buildApp()).get(
      "/static/crops/does-not-exist.webp",
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  test("cannot read files outside the public folder", async () => {
    const res = await request(buildApp()).get("/static/%2e%2e/src/app.js");
    expect([403, 404]).toContain(res.status);
    expect(res.text).not.toMatch(/createApp/);
  });

  test("does not serve a directory listing or an index page", async () => {
    const res = await request(buildApp()).get("/static/crops/");
    expect(res.status).toBe(404);
  });
});
