import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Farm from '../models/Farm.js';
import PlanSet from '../models/PlanSet.js';
import ActivePlan from '../models/ActivePlan.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { toMeDto } from '../mappers/userMapper.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'Account not found');

export async function getMe(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw notFound();
  return toMeDto(user);
}

export async function updateMe(userId, patch) {
  const $set = {};
  if (patch.fullName !== undefined) $set.fullName = patch.fullName;
  if (patch.phone !== undefined) $set.phone = patch.phone; // null clears it

  const user = await User.findByIdAndUpdate(
    userId,
    { $set },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!user) throw notFound();
  return toMeDto(user);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw notFound();

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_COST);

  // tokenVersion + 1 makes every old token stop working.
  await User.updateOne(
    { _id: userId },
    { $set: { passwordHash, passwordChangedAt: new Date() }, $inc: { tokenVersion: 1 } },
  );
}

export async function deleteAccount(userId, { confirmEmail }) {
  const user = await User.findById(userId).lean();
  if (!user) throw notFound();

  if (confirmEmail.toLowerCase() !== user.email) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request', {
      issues: [{ path: 'body.confirmEmail', message: 'Email does not match your account' }],
    });
  }

  // Only SoilMate data. Game collections are never touched.
  await Promise.all([
    Farm.deleteMany({ userId }),
    PlanSet.deleteMany({ userId }),
    ActivePlan.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });
}