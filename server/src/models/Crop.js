import mongoose from 'mongoose';
import { SLOTS, CROP_CATEGORIES, NEED_LEVELS, EQUIPMENT } from '../constants/soilmateEnums.js';

const { Schema } = mongoose;

const cropSchema = new Schema(
  {
    // "id" is a real field here (the slug), so Mongoose's built-in id virtual is turned off below.
    id: {
      type: String,
      required: true,
      unique: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    name: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '' },
    category: { type: String, enum: CROP_CATEGORIES, required: true },
    roleTag: { type: String, required: true },
    benefitTag: { type: String, default: null },
    description: { type: String, required: true },
    slots: {
      type: [{ type: String, enum: SLOTS }],
      validate: { validator: (arr) => arr.length >= 1, message: 'needs at least one slot' },
    },
    selectableAsCurrent: { type: Boolean, default: false },
    defaultForSlot: { type: String, enum: [...SLOTS, null], default: null },
    image: {
      file: { type: String, required: true },
      thumbFile: { type: String, required: true },
      alt: { type: String, required: true },
    },
    calendar: {
      plantingLabel: { type: String, default: null },
      harvestLabel: { type: String, default: null },
    },
    // INTERNAL: never returned by GET /crops, only sent to the scoring service.
    attributes: {
      family: { type: String, required: true },
      isLegume: { type: Boolean, required: true },
      waterNeed: { type: String, enum: NEED_LEVELS, required: true },
      groundCover: { type: String, enum: NEED_LEVELS, required: true },
      costLevel: { type: String, enum: NEED_LEVELS, required: true },
      equipment: { type: [{ type: String, enum: EQUIPMENT }], default: [] },
      typicalDays: { type: Number, required: true, min: 1 },
    },
    status: { type: String, enum: ['placeholder', 'reviewed'], default: 'placeholder' },
  },
  { id: false },
);

export default mongoose.model('Crop', cropSchema);