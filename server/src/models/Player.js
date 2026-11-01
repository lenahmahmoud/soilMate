import mongoose from 'mongoose';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

const { Schema } = mongoose;

const playerSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
      validate: {
        validator: (v) => uuidValidate(v) && uuidVersion(v) === 4,
        message: 'player id must be a UUID v4',
      },
    },
    lastSeenAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

export default mongoose.model('Player', playerSchema);