import mongoose from 'mongoose';
import { GAME_SLUGS } from '../constants/enums.js';

const { Schema } = mongoose;

const progressSchema = new Schema(
  {
    playerId: { type: String, required: true },
    gameSlug: { type: String, required: true, enum: GAME_SLUGS },
    bestScore: { type: Number, required: true, min: 0 },
    bestStars: { type: Number, required: true, min: 0, max: 3 },
    bestPoints: { type: Number, required: true, min: 0 },
    badgeEarned: { type: Boolean, default: false }, // once true it stays true
    timesPlayed: { type: Number, default: 0, min: 0 },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

progressSchema.index({ playerId: 1, gameSlug: 1 }, { unique: true });

export default mongoose.model('Progress', progressSchema);