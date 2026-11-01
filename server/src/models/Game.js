import mongoose from 'mongoose';
import {
  GAME_SLUGS,
  MASCOT_OUTFITS,
  CHOICE_MODES,
  COLLECTION_KINDS,
} from '../constants/enums.js';
import { oneOf } from './shared.js';

const { Schema } = mongoose;

const recapChipSchema = new Schema(
  {
    label: { type: String, required: true },
    iconKey: { type: String, required: true },
  },
  { _id: false },
);

const gameSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, enum: GAME_SLUGS },
    title: { type: String, required: true },
    position: { type: Number, required: true, unique: true, min: 1, max: 5 },
    questionsPerRound: { type: Number, required: true, validate: oneOf([5, 6]) },
    poolSize: { type: Number, required: true, validate: oneOf([6, 30]) },
    choiceMode: { type: String, required: true, enum: CHOICE_MODES },
    mascotOutfit: { type: String, required: true, enum: MASCOT_OUTFITS },
    speechBubble: { type: String, required: true },
    correctBannerTitle: { type: String, required: true },
    collectionKind: { type: String, required: true, enum: COLLECTION_KINDS },
    badge: {
      name: { type: String, required: true },
      iconKey: { type: String, required: true },
    },
    nextGameSlug: {
      type: String,
      default: null,
      validate: oneOf([...GAME_SLUGS, null]),
    },
    isFinale: { type: Boolean, default: false },
    recapChips: { type: [recapChipSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model('Game', gameSchema);