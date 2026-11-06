import mongoose from 'mongoose';
import {
  CENTER_IDS,
  SLOTS,
  WATER_SOURCES,
  WATER_AVAILABILITY,
  SOIL_TYPES,
  EQUIPMENT,
  SEASONS_PER_YEAR,
  PRIORITIES,
  AREA_UNITS,
  SETUP_STATUSES,
} from '../constants/soilmateEnums.js';

const { Schema } = mongoose;

const uniqueMax = (max) => ({
  validator: (arr) => arr.length <= max && new Set(arr).size === arr.length,
  message: `must be unique and have at most ${max} items`,
});

const draftItemSchema = new Schema(
  {
    slot: { type: String, enum: SLOTS, required: true },
    cropId: { type: String, required: true },
  },
  { _id: false },
);

const farmSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    centerId: { type: String, enum: [...CENTER_IDS, null], default: null },
    setupStatus: { type: String, enum: SETUP_STATUSES, default: 'none' },
    farmName: { type: String, trim: true, maxlength: 80, default: null },
    farmLocationText: { type: String, trim: true, maxlength: 120, default: null },
    landArea: {
      value: {
        type: Number,
        default: null,
        validate: {
          validator: (v) => v == null || (v > 0 && v <= 100000),
          message: 'must be greater than 0 and at most 100000',
        },
      },
      unit: { type: String, enum: AREA_UNITS, default: 'hectares' },
    },
    currentCrops: { type: [String], default: [], validate: uniqueMax(8) },
    waterSource: { type: String, enum: [...WATER_SOURCES, null], default: null },
    waterSourceOther: { type: String, trim: true, maxlength: 60, default: null },
    waterAvailability: { type: String, enum: [...WATER_AVAILABILITY, null], default: null },
    soilType: { type: String, enum: [...SOIL_TYPES, null], default: null },
    equipment: {
      type: [{ type: String, enum: EQUIPMENT }],
      default: [],
      validate: uniqueMax(6),
    },
    seasonsPerYear: {
      type: Number,
      default: null,
      validate: {
        validator: (v) => v == null || SEASONS_PER_YEAR.includes(v),
        message: 'must be 1, 2 or 3',
      },
    },
    priorities: {
      type: [{ type: String, enum: PRIORITIES }],
      default: [],
      validate: uniqueMax(3),
    },
    draftSequence: {
      type: [draftItemSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length === 0 || arr.length === 3,
        message: 'must have 0 or exactly 3 items',
      },
    },
  },
  { timestamps: true },
);

export default mongoose.model('Farm', farmSchema);