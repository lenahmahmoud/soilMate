import mongoose from 'mongoose';
import { CENTER_IDS } from '../constants/centers.js';
import { PLAN_TYPES, SUMMER_OPTIONS, WINTER_OPTIONS } from '../constants/rotationLab.js';

const { Schema } = mongoose;

// C8: the plan content is NOT copied here. We keep the key and the input, and the mapper
// loads the plan from the in-memory Rotation Lab data.
const activePlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    planKey: { type: String, enum: PLAN_TYPES, required: true },
    key: { type: String, required: true }, // "center|winter|summer"
    input: {
      center: { type: String, enum: CENTER_IDS, required: true },
      winter: { type: String, enum: WINTER_OPTIONS, required: true },
      summer: { type: String, enum: SUMMER_OPTIONS, required: true },
    },
    startDate: { type: Date, required: true },
    chosenAt: { type: Date, default: Date.now },
    dataVersion: { type: String, required: true }, // meta.version when it was chosen
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Only one NOT-archived plan per user. archivedAt must always be stored as null (never missing).
activePlanSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { archivedAt: { $type: 'null' } } },
);

export default mongoose.model('ActivePlan', activePlanSchema);