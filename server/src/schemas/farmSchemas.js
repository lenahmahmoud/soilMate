import { z } from 'zod';
import {
  CENTER_IDS,
  WATER_SOURCES,
  WATER_AVAILABILITY,
  SOIL_TYPES,
  EQUIPMENT,
  PRIORITIES,
  AREA_UNITS,
} from '../constants/soilmateEnums.js';
import { rotationChoiceShape } from './rotationLabSchemas.js';
const unique = (arr) => new Set(arr).size === arr.length;

const cropId = z.string().trim().min(1).max(60);

const currentCrops = z
  .array(cropId)
  .min(1, 'Pick at least 1 crop')
  .max(7, 'Pick at most 7 crops') // was 8
  .refine(unique, { message: 'Crops must be unique' });

const equipment = z
  .array(z.enum(EQUIPMENT))
  .max(6, 'Pick at most 6 items')
  .refine(unique, { message: 'Equipment must be unique' });

const priorities = z
  .array(z.enum(PRIORITIES))
  .min(1, 'Pick at least 1 priority')
  .max(3, 'Pick at most 3 priorities')
  .refine(unique, { message: 'Priorities must be unique' });

const seasonsPerYear = z.union([z.literal(1), z.literal(2)], {
  error: 'Must be 1 or 2',
});

const waterSource = z.enum(WATER_SOURCES);
const waterAvailability = z.enum(WATER_AVAILABILITY);
const soilType = z.enum(SOIL_TYPES);

// Kept only when waterSource = other (see farmService).
const waterSourceOther = z
  .string()
  .trim()
  .max(60, 'Must be at most 60 characters')
  .nullable();

const landArea = z.strictObject({
  value: z.number().gt(0, 'Must be greater than 0').max(100000, 'Must be at most 100000'),
  unit: z.enum(AREA_UNITS),
});

export const centerBody = z.strictObject({ centerId: z.enum(CENTER_IDS) });

// PUT /farm: the whole form. Every field is required (waterSourceOther may be left out).
export const putFarmBody = z.strictObject({
  currentCrops,
  waterSource,
  waterSourceOther: waterSourceOther.optional(),
  waterAvailability,
  soilType,
  equipment,
  seasonsPerYear,
  priorities,
});
// PUT /farm/rotation (C6): same rules as GET /rotation-lab/plans. Missing, null or "" = fallow.
export const rotationBody = z.strictObject({ ...rotationChoiceShape });
// PATCH /farm: same rules, every field optional, unknown keys rejected, at least one key.
export const patchFarmBody = z
  .strictObject({
    farmName: z.string().trim().max(80, 'Must be at most 80 characters').nullable().optional(),
    farmLocationText: z.string().trim().max(120, 'Must be at most 120 characters').nullable().optional(),
    landArea: landArea.optional(),
    currentCrops: currentCrops.optional(),
    waterSource: waterSource.optional(),
    waterSourceOther: waterSourceOther.optional(),
    waterAvailability: waterAvailability.optional(),
    soilType: soilType.optional(),
    equipment: equipment.optional(),
    seasonsPerYear: seasonsPerYear.optional(),
    priorities: priorities.optional(),
    centerId: z.enum(CENTER_IDS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });