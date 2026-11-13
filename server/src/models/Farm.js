import mongoose from "mongoose";
import {
  CENTER_IDS,
  WATER_SOURCES,
  WATER_AVAILABILITY,
  SOIL_TYPES,
  EQUIPMENT,
  SEASONS_PER_YEAR,
  PRIORITIES,
  AREA_UNITS,
  SETUP_STATUSES,
} from "../constants/soilmateEnums.js";
import { SUMMER_OPTIONS, WINTER_OPTIONS } from "../constants/rotationLab.js";

const { Schema } = mongoose;

const uniqueMax = (max) => ({
  validator: (arr) => arr.length <= max && new Set(arr).size === arr.length,
  message: `must be unique and have at most ${max} items`,
});

const farmSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    centerId: { type: String, enum: [...CENTER_IDS, null], default: null },
    setupStatus: { type: String, enum: SETUP_STATUSES, default: "none" },
    farmName: { type: String, trim: true, maxlength: 80, default: null },
    farmLocationText: { type: String, trim: true, maxlength: 120, default: null },
    landArea: {
      value: {
        type: Number,
        default: null,
        validate: {
          validator: (v) => v == null || (v > 0 && v <= 100000),
          message: "must be greater than 0 and at most 100000",
        },
      },
      unit: { type: String, enum: AREA_UNITS, default: "hectares" },
    },
    // Data crop ids (wheat, maize ...). 1-7 when complete (C4). Checked against the in-memory crop source by farmService.
    currentCrops: { type: [String], default: [], validate: uniqueMax(7) },
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
        message: "must be 1, 2 ",
      },
    },
    priorities: {
      type: [{ type: String, enum: PRIORITIES }],
      default: [],
      validate: uniqueMax(3),
    },
    // C4/C6: replaces draftSequence. null = "not chosen yet"; "fallow" = no crop that season.
    // Written by PUT /farm/rotation (Phase 2).
    rotationInput: {
      winter: { type: String, enum: [...WINTER_OPTIONS, null], default: null },
      summer: { type: String, enum: [...SUMMER_OPTIONS, null], default: null },
    },
  },
  { timestamps: true },
);

export default mongoose.model("Farm", farmSchema);