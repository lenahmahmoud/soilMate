import mongoose from 'mongoose';
import { GAME_SLUGS, ATTEMPT_STATUSES } from '../constants/enums.js';
import { itemSchema, oneOf } from './shared.js';

const { Schema } = mongoose;

const attemptQuestionSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    position: { type: Number, required: true, min: 1 },
    choices: { type: [itemSchema], default: [] }, // final ORDERED choices shown to the player
    wrongChoiceKeys: { type: [String], default: [] },
    wrongCount: { type: Number, default: 0, min: 0 },
    firstTryCorrect: { type: Boolean, default: false },
    skipped: { type: Boolean, default: false },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
  },
  { _id: false },
);

const resultSchema = new Schema(
  {
    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, validate: oneOf([5, 6]) },
    stars: { type: Number, required: true, min: 0, max: 3 },
    badgeEarned: { type: Boolean, required: true },
    completedAt: { type: Date, required: true },
  },
  { _id: false },
);

const attemptSchema = new Schema(
  {
    playerId: { type: String, required: true },
    gameSlug: { type: String, required: true, enum: GAME_SLUGS },
    status: { type: String, required: true, enum: ATTEMPT_STATUSES, default: 'active' },
    hearts: { type: Number, default: 3, min: 0, max: 3 },
    streak: { type: Number, default: 0, min: 0 },
    bestStreak: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, validate: oneOf([5, 6]) },
    questions: { type: [attemptQuestionSchema], default: [] },
    result: { type: resultSchema },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
    expiresAt: { type: Date }, // the complete service removes it when status becomes completed
  },
  { timestamps: true },
);

attemptSchema.index({ playerId: 1, gameSlug: 1, status: 1 });
// TTL: documents without expiresAt (completed attempts) never expire
attemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Attempt', attemptSchema);