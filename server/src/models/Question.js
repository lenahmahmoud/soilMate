import mongoose from 'mongoose';
import {
  GAME_SLUGS,
  G2_ANSWER_GROUPS,
  G3_POWER_GROUPS,
  NASA_TAGS,
} from '../constants/enums.js';
import { itemSchema } from './shared.js';

const { Schema } = mongoose;

const questionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, match: /^g[1-5]-\d{3}$/ },
    gameSlug: { type: String, required: true, enum: GAME_SLUGS },
    prompt: { type: String, required: true },
    subtitle: { type: String },
    illustrationKey: { type: String },
    illustrationFixedKey: { type: String }, // Game 4 only
    resultAnimationKey: { type: String }, // Game 5 only
    choices: {
      type: [itemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'choices must have at least one item',
      },
    },
    correctChoiceKey: { type: String, required: true, select: false },
    explanation: { type: String, required: true, select: false },
    group: { type: String, enum: [...G2_ANSWER_GROUPS, ...G3_POWER_GROUPS] },
    collectionItem: { type: itemSchema },
    nasaTag: { type: String, enum: NASA_TAGS },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

questionSchema.index({ gameSlug: 1, active: 1 });
questionSchema.index({ gameSlug: 1, group: 1 });

export default mongoose.model('Question', questionSchema);