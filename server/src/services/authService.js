import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { toUserDto } from '../mappers/userMapper.js';

export const TERMS_VERSION = '2026-11';

const emailTaken = () =>
  new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered');

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');

// Compared against when the email does not exist, so both cases take similar time.
let dummyHashPromise;
const getDummyHash = () =>
  (dummyHashPromise ??= bcrypt.hash('soilmate-dummy-password', env.BCRYPT_COST));

export function issueToken(user, { rememberMe = false } = {}) {
  const expiresIn = rememberMe ? env.JWT_EXPIRES_REMEMBER : env.JWT_EXPIRES_DEFAULT;
  const token = jwt.sign(
    { sub: String(user._id), tv: user.tokenVersion ?? 0 },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn },
  );
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function signup({ fullName, email, password }) {
  if (await User.exists({ email })) throw emailTaken();

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);

  let user;
  try {
    user = await User.create({
      fullName,
      email,
      passwordHash,
      acceptedTerms: { version: TERMS_VERSION, at: new Date() },
    });
  } catch (err) {
    // Two signups at the same moment: the unique index catches the second one.
    if (err?.code === 11000) throw emailTaken();
    throw err;
  }

  return { ...issueToken(user), user: toUserDto(user) };
}

export async function login({ email, password, rememberMe }) {
  const user = await User.findOne({ email }).select('+passwordHash +tokenVersion');

  const hash = user ? user.passwordHash : await getDummyHash();
  const passwordOk = await bcrypt.compare(password, hash);
  if (!user || !passwordOk) throw invalidCredentials();

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  return { ...issueToken(user, { rememberMe }), user: toUserDto(user) };
}