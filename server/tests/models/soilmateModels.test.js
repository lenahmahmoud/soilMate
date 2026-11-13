import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../../src/models/User.js";
import Farm from "../../src/models/Farm.js";
import ActivePlan from "../../src/models/ActivePlan.js";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User, Farm, ActivePlan].map((m) => m.init()));
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

const oid = () => new mongoose.Types.ObjectId();

const validUser = (over = {}) => ({
  fullName: "Alex Henderson",
  email: "alex@example.com",
  passwordHash: "not-a-real-hash",
  acceptedTerms: { version: "2026-11", at: new Date() },
  ...over,
});

// C7/C8: the ActivePlan stores the reference to the chosen Rotation Lab plan, not a copy of it.
const validActivePlan = (over = {}) => ({
  userId: oid(),
  planKey: "soil_health",
  key: "desouk|wheat|maize",
  input: { center: "desouk", winter: "wheat", summer: "maize" },
  startDate: new Date("2026-11-15"),
  dataVersion: "v3-rotation-1.1",
  ...over,
});

describe("User", () => {
  test("saves a valid user with defaults", async () => {
    const u = await User.create(validUser());
    expect(u.emailVerified).toBe(false);
    expect(u.phone).toBeNull();
    expect(u.avatarUrl).toBeNull();
    expect(u.lastLoginAt).toBeNull();
    expect(u.passwordChangedAt).toBeInstanceOf(Date);
  });

  test("stores the email lowercase and trimmed", async () => {
    const u = await User.create(validUser({ email: "  Alex@Example.COM " }));
    expect(u.email).toBe("alex@example.com");
  });

  test("rejects a duplicate email, even with different letter case", async () => {
    await User.create(validUser());
    await expect(
      User.create(validUser({ email: "ALEX@example.com" })),
    ).rejects.toThrow(/E11000/);
  });

  test("rejects a name shorter than 2 characters", async () => {
    await expect(User.create(validUser({ fullName: "A" }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  test("rejects a missing acceptedTerms", async () => {
    await expect(
      User.create(validUser({ acceptedTerms: undefined })),
    ).rejects.toThrow(/validation failed/i);
  });

  test("accepts a normalized phone and rejects a bad one", async () => {
    await expect(
      User.create(validUser({ phone: "+15553829104" })),
    ).resolves.toBeDefined();
    await expect(
      User.create(validUser({ email: "b@example.com", phone: "12ab" })),
    ).rejects.toThrow(/validation failed/i);
  });

  test("passwordHash and tokenVersion are hidden by default", async () => {
    await User.create(validUser());
    const plain = await User.findOne({ email: "alex@example.com" }).lean();
    expect(plain.passwordHash).toBeUndefined();
    expect(plain.tokenVersion).toBeUndefined();
  });

  test("they are returned when selected explicitly", async () => {
    await User.create(validUser());
    const full = await User.findOne({ email: "alex@example.com" })
      .select("+passwordHash +tokenVersion")
      .lean();
    expect(full.passwordHash).toBe("not-a-real-hash");
    expect(full.tokenVersion).toBe(0);
  });

  test("toJSON never contains passwordHash, tokenVersion or __v", async () => {
    const u = await User.create(validUser());
    const json = u.toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.tokenVersion).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.email).toBe("alex@example.com");
  });
});

describe("Farm", () => {
  test("an empty farm has the expected defaults", async () => {
    const f = await Farm.create({ userId: oid() });
    expect(f.setupStatus).toBe("none");
    expect(f.centerId).toBeNull();
    expect(f.farmName).toBeNull();
    expect(f.landArea.value).toBeNull();
    expect(f.landArea.unit).toBe("hectares");
    expect(f.currentCrops).toHaveLength(0);
    expect(f.equipment).toHaveLength(0);
    expect(f.priorities).toHaveLength(0);
    expect(f.rotationInput.winter).toBeNull();
    expect(f.rotationInput.summer).toBeNull();
    expect(f.waterSource).toBeNull();
    expect(f.soilType).toBeNull();
    expect(f.seasonsPerYear).toBeNull();
  });

  test("rejects a second farm for the same user", async () => {
    const userId = oid();
    await Farm.create({ userId });
    await expect(Farm.create({ userId })).rejects.toThrow(/E11000/);
  });

  test("rejects an unknown centerId and accepts a real one", async () => {
    await expect(
      Farm.create({ userId: oid(), centerId: "cairo" }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({ userId: oid(), centerId: "baltim" }),
    ).resolves.toBeDefined();
  });

  test("rejects more than 3 priorities and duplicate priorities", async () => {
    await expect(
      Farm.create({
        userId: oid(),
        priorities: [
          "save_water",
          "improve_soil",
          "protect_land",
          "manage_costs",
        ],
      }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({ userId: oid(), priorities: ["save_water", "save_water"] }),
    ).rejects.toThrow(/validation failed/i);
  });

  test("rejects an unknown priority", async () => {
    await expect(
      Farm.create({ userId: oid(), priorities: ["get_rich"] }),
    ).rejects.toThrow(/validation failed/i);
  });

  test("rejects more than 7 current crops and duplicate crops", async () => {
    const eight = Array.from({ length: 8 }, (_, i) => `crop-${i}`);
    await expect(
      Farm.create({ userId: oid(), currentCrops: eight }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({ userId: oid(), currentCrops: ["maize", "maize"] }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({
        userId: oid(),
        currentCrops: Array.from({ length: 7 }, (_, i) => `crop-${i}`),
      }),
    ).resolves.toBeDefined();
  });

  test("rejects duplicate equipment and an unknown equipment id", async () => {
    await expect(
      Farm.create({
        userId: oid(),
        equipment: ["standard_tractor", "standard_tractor"],
      }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({ userId: oid(), equipment: ["rocket"] }),
    ).rejects.toThrow(/validation failed/i);
  });

  test("landArea.value must be greater than 0", async () => {
    await expect(
      Farm.create({ userId: oid(), landArea: { value: 0 } }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({ userId: oid(), landArea: { value: -5 } }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({ userId: oid(), landArea: { value: 42.5, unit: "acres" } }),
    ).resolves.toBeDefined();
  });

  test("seasonsPerYear must be 1 or 2", async () => {
    await expect(
      Farm.create({ userId: oid(), seasonsPerYear: 4 }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({ userId: oid(), seasonsPerYear: 3 }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({ userId: oid(), seasonsPerYear: 1 }),
    ).resolves.toBeDefined();
    await expect(
      Farm.create({ userId: oid(), seasonsPerYear: 2 }),
    ).resolves.toBeDefined();
  });

  test("rotationInput holds the winter and the summer crop only", async () => {
    await expect(
      Farm.create({
        userId: oid(),
        rotationInput: { winter: "wheat", summer: "maize" },
      }),
    ).resolves.toBeDefined();
    await expect(
      Farm.create({
        userId: oid(),
        rotationInput: { winter: "fallow", summer: "fallow" },
      }),
    ).resolves.toBeDefined();
    await expect(
      Farm.create({
        userId: oid(),
        rotationInput: { winter: "winter-wheat", summer: "maize" },
      }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({
        userId: oid(),
        rotationInput: { winter: "maize", summer: "maize" },
      }),
    ).rejects.toThrow(/validation failed/i);
  });
});

describe("ActivePlan", () => {
  test("saves a valid plan; archivedAt is stored as null", async () => {
    await ActivePlan.create(validActivePlan());
    const plain = await ActivePlan.findOne().lean();
    expect(plain.archivedAt).toBeNull();
    expect(plain.chosenAt).toBeInstanceOf(Date);
    expect(plain.planKey).toBe("soil_health");
    expect(plain.key).toBe("desouk|wheat|maize");
    expect(plain.input).toEqual({
      center: "desouk",
      winter: "wheat",
      summer: "maize",
    });
    expect(plain.dataVersion).toBe("v3-rotation-1.1");
  });

  test("stores the reference only: the plan content is not copied", async () => {
    await ActivePlan.create(validActivePlan());
    const plain = await ActivePlan.findOne().lean();
    expect(plain).not.toHaveProperty("plan");
    expect(plain).not.toHaveProperty("sequence");
    expect(plain).not.toHaveProperty("planSetId");
    expect(plain).not.toHaveProperty("status");
    expect(plain).not.toHaveProperty("modelVersion");
  });

  test("rejects an unknown planKey, a missing key and an unknown crop in the input", async () => {
    await expect(
      ActivePlan.create(validActivePlan({ planKey: "plan_9" })),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      ActivePlan.create(validActivePlan({ key: undefined })),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      ActivePlan.create(
        validActivePlan({
          input: { center: "desouk", winter: "winter-wheat", summer: "maize" },
        }),
      ),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      ActivePlan.create(
        validActivePlan({
          input: { center: "desouk", winter: "maize", summer: "maize" },
        }),
      ),
    ).rejects.toThrow(/validation failed/i);
  });

  test("rejects a second active plan for the same user", async () => {
    const userId = oid();
    await ActivePlan.create(validActivePlan({ userId }));
    await expect(
      ActivePlan.create(validActivePlan({ userId })),
    ).rejects.toThrow(/E11000/);
  });

  test("allows a new active plan once the previous one is archived", async () => {
    const userId = oid();
    const first = await ActivePlan.create(validActivePlan({ userId }));
    await ActivePlan.updateOne(
      { _id: first._id },
      { $set: { archivedAt: new Date() } },
    );
    await expect(
      ActivePlan.create(validActivePlan({ userId })),
    ).resolves.toBeDefined();
  });

  test("allows many archived plans for the same user", async () => {
    const userId = oid();
    await ActivePlan.create(
      validActivePlan({ userId, archivedAt: new Date() }),
    );
    await ActivePlan.create(
      validActivePlan({ userId, archivedAt: new Date() }),
    );
    expect(await ActivePlan.countDocuments({ userId })).toBe(2);
  });

  test("different users can each have an active plan", async () => {
    await ActivePlan.create(validActivePlan());
    await expect(ActivePlan.create(validActivePlan())).resolves.toBeDefined();
  });
});
