import mongoose from "mongoose";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, default: null, match: /^\+?\d{7,15}$/ },
    avatarUrl: { type: String, default: null },
    emailVerified: { type: Boolean, default: false },
    acceptedTerms: {
      version: { type: String, required: true },
      at: { type: Date, required: true },
    },
    tokenVersion: { type: Number, default: 0, select: false },
    passwordChangedAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: null },
    // Guests (no account yet) are User documents with isGuest = true. See services/guestService.js
    isGuest: { type: Boolean, default: false },
    guestId: { type: String, default: undefined },
    lastSeenAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    // Safety net: even if a mapper is forgotten, these never leave the server.
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  },
);
userSchema.index(
  { guestId: 1 },
  { unique: true, partialFilterExpression: { guestId: { $type: "string" } } },
);
export default mongoose.model("User", userSchema);
