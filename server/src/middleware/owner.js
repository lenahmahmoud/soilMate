import { requireAuth } from './auth.js';
import { findOrCreateGuest } from '../services/guestService.js';
import { AppError } from '../utils/AppError.js';
import { GUEST_ID_RE, GUEST_HEADER } from '../constants/guest.js';

// For routes a visitor can use without an account (Farm, Rotation Lab, plans, ...).
//   Authorization: Bearer <token>  -> a real account. An invalid token is 401; it never falls back to a guest.
//   X-Guest-Id: <uuid v4>          -> a guest (created on first use)
// Either way the next handlers see req.user = { id, isGuest? } and need no other change.
export async function requireOwner(req, res, next) {
  try {
    if (req.get('Authorization')) return requireAuth(req, res, next);

    const guestId = req.get(GUEST_HEADER);
    if (!guestId) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Log in or continue as a guest');
    }
    if (!GUEST_ID_RE.test(guestId)) {
      throw new AppError(400, 'INVALID_GUEST_ID', `${GUEST_HEADER} must be a UUID v4`);
    }

    const guest = await findOrCreateGuest(guestId);
    req.user = { id: String(guest._id), isGuest: true };
    return next();
  } catch (err) {
    return next(err);
  }
}