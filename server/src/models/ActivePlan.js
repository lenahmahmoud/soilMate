import mongoose from 'mongoose';
import { SLOTS, PLAN_KEYS, DATA_STATUSES } from '../constants/soilmateEnums.js';

const { Schema } = mongoose;

const sequenceItemSchema = new Schema(
  {
    slot: { type: String, enum: SLOTS, required: true },
    cropId: { type: String, required: true },
    roleTag: { type: String, default: null },
  },
  { _id: false },
);

const activePlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    planSetId: { type: Schema.Types.ObjectId, ref: 'PlanSet', required: true },
    planKey: { type: String, enum: PLAN_KEYS, required: true },
    title: { type: String, required: true },
    startDate: { type: Date, required: true },
    chosenAt: { type: Date, default: Date.now },
    status: { type: String, enum: DATA_STATUSES, required: true },
    modelVersion: { type: String, required: true },
    sequence: { type: [sequenceItemSchema], required: true },
    fit: { type: [Schema.Types.Mixed], default: [] },
    seasonDetails: { type: [Schema.Types.Mixed], default: [] },
    evidence: { type: [String], default: [] },
    infoGaps: { type: [String], default: [] },
    risksToReview: { type: [String], default: [] },
    dataConfidence: { type: Schema.Types.Mixed, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Only one NOT-archived plan per user. Archived plans fall outside this index.
// archivedAt must always be stored as null (never missing); the default above does that.
activePlanSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { archivedAt: { $type: 'null' } } },
);

export default mongoose.model('ActivePlan', activePlanSchema);