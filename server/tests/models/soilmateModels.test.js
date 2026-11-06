import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Farm from '../../src/models/Farm.js';
import Crop from '../../src/models/Crop.js';
import PlanSet from '../../src/models/PlanSet.js';
import ActivePlan from '../../src/models/ActivePlan.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User, Farm, Crop, PlanSet, ActivePlan].map((m) => m.init()));
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
  fullName: 'Alex Henderson',
  email: 'alex@example.com',
  passwordHash: 'not-a-real-hash',
  acceptedTerms: { version: '2026-11', at: new Date() },
  ...over,
});

const validCrop = (over = {}) => ({
  id: 'winter-rye',
  name: 'Winter Rye',
  category: 'cover_crop',
  roleTag: 'Cover Crop',
  description: 'Protects topsoil & holds moisture',
  slots: ['fall_winter'],
  image: {
    file: 'winter-rye.webp',
    thumbFile: 'winter-rye.webp',
    alt: 'Winter rye field',
  },
  attributes: {
    family: 'grass',
    isLegume: false,
    waterNeed: 'low',
    groundCover: 'high',
    costLevel: 'low',
    equipment: ['seed_drill_planter'],
    typicalDays: 150,
  },
  ...over,
});

const validPlanSet = (over = {}) => ({
  userId: oid(),
  centerId: 'desouk',
  farmSnapshot: { soilType: 'loamy' },
  status: 'placeholder',
  modelVersion: 'mock-0.1',
  plans: [{ planKey: 'keep_routine', matchScore: 64, rank: 3 }],
  ...over,
});

const validActivePlan = (over = {}) => ({
  userId: oid(),
  planSetId: oid(),
  planKey: 'improve_soil',
  title: 'Improve My Soil',
  startDate: new Date('2026-11-15'),
  status: 'placeholder',
  modelVersion: 'mock-0.1',
  sequence: [{ slot: 'fall_winter', cropId: 'winter-rye', roleTag: 'Cover Crop' }],
  ...over,
});

describe('User', () => {
  test('saves a valid user with defaults', async () => {
    const u = await User.create(validUser());
    expect(u.emailVerified).toBe(false);
    expect(u.phone).toBeNull();
    expect(u.avatarUrl).toBeNull();
    expect(u.lastLoginAt).toBeNull();
    expect(u.passwordChangedAt).toBeInstanceOf(Date);
  });

  test('stores the email lowercase and trimmed', async () => {
    const u = await User.create(validUser({ email: '  Alex@Example.COM ' }));
    expect(u.email).toBe('alex@example.com');
  });

  test('rejects a duplicate email, even with different letter case', async () => {
    await User.create(validUser());
    await expect(User.create(validUser({ email: 'ALEX@example.com' }))).rejects.toThrow(/E11000/);
  });

  test('rejects a name shorter than 2 characters', async () => {
    await expect(User.create(validUser({ fullName: 'A' }))).rejects.toThrow(/validation failed/i);
  });

  test('rejects a missing acceptedTerms', async () => {
    await expect(User.create(validUser({ acceptedTerms: undefined }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('accepts a normalized phone and rejects a bad one', async () => {
    await expect(User.create(validUser({ phone: '+15553829104' }))).resolves.toBeDefined();
    await expect(
      User.create(validUser({ email: 'b@example.com', phone: '12ab' })),
    ).rejects.toThrow(/validation failed/i);
  });

  test('passwordHash and tokenVersion are hidden by default', async () => {
    await User.create(validUser());
    const plain = await User.findOne({ email: 'alex@example.com' }).lean();
    expect(plain.passwordHash).toBeUndefined();
    expect(plain.tokenVersion).toBeUndefined();
  });

  test('they are returned when selected explicitly', async () => {
    await User.create(validUser());
    const full = await User.findOne({ email: 'alex@example.com' })
      .select('+passwordHash +tokenVersion')
      .lean();
    expect(full.passwordHash).toBe('not-a-real-hash');
    expect(full.tokenVersion).toBe(0);
  });

  test('toJSON never contains passwordHash, tokenVersion or __v', async () => {
    const u = await User.create(validUser());
    const json = u.toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.tokenVersion).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.email).toBe('alex@example.com');
  });
});

describe('Farm', () => {
  test('an empty farm has the expected defaults', async () => {
    const f = await Farm.create({ userId: oid() });
    expect(f.setupStatus).toBe('none');
    expect(f.centerId).toBeNull();
    expect(f.farmName).toBeNull();
    expect(f.landArea.value).toBeNull();
    expect(f.landArea.unit).toBe('hectares');
    expect(f.currentCrops).toHaveLength(0);
    expect(f.equipment).toHaveLength(0);
    expect(f.priorities).toHaveLength(0);
    expect(f.draftSequence).toHaveLength(0);
    expect(f.waterSource).toBeNull();
    expect(f.soilType).toBeNull();
    expect(f.seasonsPerYear).toBeNull();
  });

  test('rejects a second farm for the same user', async () => {
    const userId = oid();
    await Farm.create({ userId });
    await expect(Farm.create({ userId })).rejects.toThrow(/E11000/);
  });

  test('rejects an unknown centerId and accepts a real one', async () => {
    await expect(Farm.create({ userId: oid(), centerId: 'cairo' })).rejects.toThrow(
      /validation failed/i,
    );
    await expect(Farm.create({ userId: oid(), centerId: 'baltim' })).resolves.toBeDefined();
  });

  test('rejects more than 3 priorities and duplicate priorities', async () => {
    await expect(
      Farm.create({
        userId: oid(),
        priorities: ['save_water', 'improve_soil', 'protect_land', 'manage_costs'],
      }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({ userId: oid(), priorities: ['save_water', 'save_water'] }),
    ).rejects.toThrow(/validation failed/i);
  });

  test('rejects an unknown priority', async () => {
    await expect(Farm.create({ userId: oid(), priorities: ['get_rich'] })).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('rejects more than 8 current crops and duplicate crops', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => `crop-${i}`);
    await expect(Farm.create({ userId: oid(), currentCrops: nine })).rejects.toThrow(
      /validation failed/i,
    );
    await expect(
      Farm.create({ userId: oid(), currentCrops: ['field-corn', 'field-corn'] }),
    ).rejects.toThrow(/validation failed/i);
  });

  test('rejects duplicate equipment and an unknown equipment id', async () => {
    await expect(
      Farm.create({ userId: oid(), equipment: ['standard_tractor', 'standard_tractor'] }),
    ).rejects.toThrow(/validation failed/i);
    await expect(Farm.create({ userId: oid(), equipment: ['rocket'] })).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('landArea.value must be greater than 0', async () => {
    await expect(Farm.create({ userId: oid(), landArea: { value: 0 } })).rejects.toThrow(
      /validation failed/i,
    );
    await expect(Farm.create({ userId: oid(), landArea: { value: -5 } })).rejects.toThrow(
      /validation failed/i,
    );
    await expect(
      Farm.create({ userId: oid(), landArea: { value: 42.5, unit: 'acres' } }),
    ).resolves.toBeDefined();
  });

  test('seasonsPerYear must be 1, 2 or 3', async () => {
    await expect(Farm.create({ userId: oid(), seasonsPerYear: 4 })).rejects.toThrow(
      /validation failed/i,
    );
    await expect(Farm.create({ userId: oid(), seasonsPerYear: 2 })).resolves.toBeDefined();
  });

  test('draftSequence must have 0 or exactly 3 items', async () => {
    const item = (slot) => ({ slot, cropId: 'winter-rye' });
    await expect(
      Farm.create({ userId: oid(), draftSequence: [item('fall_winter'), item('spring')] }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Farm.create({
        userId: oid(),
        draftSequence: [item('fall_winter'), item('spring'), item('summer_fall')],
      }),
    ).resolves.toBeDefined();
  });
});

describe('Crop', () => {
  test('saves a valid crop with defaults', async () => {
    const c = await Crop.create(validCrop());
    expect(c.status).toBe('placeholder');
    expect(c.selectableAsCurrent).toBe(false);
    expect(c.defaultForSlot).toBeNull();
    expect(c.benefitTag).toBeNull();
    expect(c.calendar.plantingLabel).toBeNull();
  });

  test('keeps the slug in the "id" field', async () => {
    await Crop.create(validCrop());
    const plain = await Crop.findOne({ id: 'winter-rye' }).lean();
    expect(plain.id).toBe('winter-rye');
  });

  test('rejects a duplicate id', async () => {
    await Crop.create(validCrop());
    await expect(Crop.create(validCrop())).rejects.toThrow(/E11000/);
  });

  test('rejects an id that is not a kebab-case slug', async () => {
    await expect(Crop.create(validCrop({ id: 'Winter Rye' }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('rejects a crop with no slots and a crop with an unknown slot', async () => {
    await expect(Crop.create(validCrop({ slots: [] }))).rejects.toThrow(/validation failed/i);
    await expect(Crop.create(validCrop({ slots: ['winter'] }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('rejects a crop without image files or alt text', async () => {
    await expect(
      Crop.create(validCrop({ image: { file: 'a.webp', thumbFile: 'a.webp' } })),
    ).rejects.toThrow(/validation failed/i);
  });

  test('rejects invalid attribute values', async () => {
    const attrs = validCrop().attributes;
    await expect(
      Crop.create(validCrop({ attributes: { ...attrs, waterNeed: 'extreme' } })),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Crop.create(validCrop({ attributes: { ...attrs, typicalDays: 0 } })),
    ).rejects.toThrow(/validation failed/i);
  });

  test('rejects an unknown category', async () => {
    await expect(Crop.create(validCrop({ category: 'fruit' }))).rejects.toThrow(
      /validation failed/i,
    );
  });
});

describe('PlanSet', () => {
  test('saves a valid plan set; labSequence defaults to null', async () => {
    const p = await PlanSet.create(validPlanSet());
    expect(p.labSequence).toBeNull();
    expect(p.createdAt).toBeInstanceOf(Date);
    expect(p.plans[0].matchScore).toBe(64);
  });

  test('rejects an invalid status and an unknown centerId', async () => {
    await expect(PlanSet.create(validPlanSet({ status: 'draft' }))).rejects.toThrow(
      /validation failed/i,
    );
    await expect(PlanSet.create(validPlanSet({ centerId: 'cairo' }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('has a 30-day TTL index on createdAt', async () => {
    const indexes = await PlanSet.collection.indexes();
    const ttl = indexes.find((i) => i.key.createdAt === 1);
    expect(ttl).toBeDefined();
    expect(ttl.expireAfterSeconds).toBe(60 * 60 * 24 * 30);
  });
});

describe('ActivePlan', () => {
  test('saves a valid plan; archivedAt is stored as null', async () => {
    await ActivePlan.create(validActivePlan());
    const plain = await ActivePlan.findOne().lean();
    expect(plain.archivedAt).toBeNull();
    expect(plain.evidence).toEqual([]);
    expect(plain.infoGaps).toEqual([]);
    expect(plain.risksToReview).toEqual([]);
    expect(plain.chosenAt).toBeInstanceOf(Date);
  });

  test('rejects an unknown planKey and an invalid status', async () => {
    await expect(ActivePlan.create(validActivePlan({ planKey: 'plan_9' }))).rejects.toThrow(
      /validation failed/i,
    );
    await expect(ActivePlan.create(validActivePlan({ status: 'draft' }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('rejects a second active plan for the same user', async () => {
    const userId = oid();
    await ActivePlan.create(validActivePlan({ userId }));
    await expect(ActivePlan.create(validActivePlan({ userId }))).rejects.toThrow(/E11000/);
  });

  test('allows a new active plan once the previous one is archived', async () => {
    const userId = oid();
    const first = await ActivePlan.create(validActivePlan({ userId }));
    await ActivePlan.updateOne({ _id: first._id }, { $set: { archivedAt: new Date() } });
    await expect(ActivePlan.create(validActivePlan({ userId }))).resolves.toBeDefined();
  });

  test('allows many archived plans for the same user', async () => {
    const userId = oid();
    await ActivePlan.create(validActivePlan({ userId, archivedAt: new Date() }));
    await ActivePlan.create(validActivePlan({ userId, archivedAt: new Date() }));
    expect(await ActivePlan.countDocuments({ userId })).toBe(2);
  });

  test('different users can each have an active plan', async () => {
    await ActivePlan.create(validActivePlan());
    await expect(ActivePlan.create(validActivePlan())).resolves.toBeDefined();
  });
});