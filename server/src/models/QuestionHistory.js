import mongoose from 'mongoose';
import { GAME_SLUGS } from '../constants/enums.js';

const { Schema } = mongoose;

const questionHistorySchema = new Schema(
  {
    playerId: { type: String, required: true },
    gameSlug: { type: String, required: true, enum: GAME_SLUGS },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    timesSeen: { type: Number, default: 0, min: 0 },
    lastSeenAt: { type: Date },
  },
  { timestamps: true },
);

questionHistorySchema.index({ playerId: 1, questionId: 1 }, { unique: true });
questionHistorySchema.index({ playerId: 1, gameSlug: 1 });

export default mongoose.model('QuestionHistory', questionHistorySchema);