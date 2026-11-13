import mongoose from 'mongoose';
import { SLOTS, CENTER_IDS, DATA_STATUSES } from '../constants/soilmateEnums.js';

const { Schema } = mongoose;

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

const labItemSchema = new Schema(
  {
    slot: { type: String, enum: SLOTS, required: true },
    cropId: { type: String, required: true },
  },
  { _id: false },
);

const planSetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    centerId: { type: String, enum: CENTER_IDS, required: true },
    farmSnapshot: { type: Schema.Types.Mixed, required: true },
    mySequence: { type: [labItemSchema], default: null },
    status: { type: String, enum: DATA_STATUSES, required: true },
    modelVersion: { type: String, required: true },
    // Full plan objects exactly as returned to the client (including matchScore and rank).
    plans: { type: [Schema.Types.Mixed], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// A saved comparison expires after 30 days.
planSetSchema.index({ createdAt: 1 }, { expireAfterSeconds: THIRTY_DAYS_SECONDS });

export default mongoose.model('PlanSet', planSetSchema);