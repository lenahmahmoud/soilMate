import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const unauthenticated = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export async function requireAuth(req, res, next) {
  try {
    const [scheme, token] = (req.get('Authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthenticated();

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      throw unauthenticated(); // expired, bad signature, malformed
    }

    // Checked here so a bad id gives 401, not a Mongoose CastError (which maps to 404).
    if (typeof payload.sub !== 'string' || !OBJECT_ID.test(payload.sub)) throw unauthenticated();

    const user = await User.findById(payload.sub).select('+tokenVersion').lean();
    if (!user || payload.tv !== (user.tokenVersion ?? 0)) throw unauthenticated();

    req.user = { id: String(user._id) };
    next();
  } catch (err) {
    next(err);
  }
}