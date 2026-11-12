import User from '../models/User.js';
import Farm from '../models/Farm.js';
import PlanSet from '../models/PlanSet.js';
import ActivePlan from '../models/ActivePlan.js';
import { logger } from '../config/logger.js';
import { GUEST_ID_RE, GUEST_HEADER } from '../constants/guest.js';

const TOUCH_EVERY_MS = 60 * 60 * 1000; // lastSeenAt is refreshed at most once an hour

// A guest is a User document with isGuest = true. Farm, PlanSet and ActivePlan are keyed by
// userId, so a guest uses exactly the same code as a real account. The e-mail is made up and
// the password hash is not a valid hash, so nobody can ever log in as a guest.
async function createGuest(guestId) {
  try {
    return await User.create({
      fullName: 'Guest',
      email: `guest-${guestId}@guest.invalid`,
      passwordHash: '!guest-cannot-log-in',
      acceptedTerms: { version: 'guest', at: new Date() },
      isGuest: true,
      guestId,
      lastSeenAt: new Date(),
    });
  } catch (err) {
    // two parallel first requests with the same id: the unique index lets one win
    if (err?.code === 11000) return User.findOne({ guestId, isGuest: true });
    throw err;
  }
}

export async function findOrCreateGuest(rawGuestId) {
  const guestId = rawGuestId.toLowerCase();
  const guest = await User.findOne({ guestId, isGuest: true }).select('_id lastSeenAt').lean();
  if (!guest) return createGuest(guestId);

  if (!guest.lastSeenAt || Date.now() - new Date(guest.lastSeenAt).getTime() > TOUCH_EVERY_MS) {
    await User.updateOne({ _id: guest._id }, { $set: { lastSeenAt: new Date() } });
  }
  return guest;
}

// Called after signup / login when the request carries X-Guest-Id.
//   adopted   the account had no farm yet, so the guest's farm, plans and active plan now belong to it
//   discarded the account already has its own farm: that one is kept, the guest's data is deleted
//   none      the guest had no farm
export async function claimGuestData(rawGuestId, userId) {
  const guestId = rawGuestId.toLowerCase();
  const guest = await User.findOne({ guestId, isGuest: true }).select('_id').lean();
  if (!guest) return 'none';

  const guestFarm = await Farm.findOne({ userId: guest._id }).select('_id').lean();
  const userFarm = await Farm.findOne({ userId }).select('setupStatus').lean();

  let outcome = 'none';
  if (guestFarm) {
    if (!userFarm || userFarm.setupStatus === 'none') {
      // the account's farm is empty: replace it with the guest's
      await Promise.all([
        Farm.deleteMany({ userId }),
        PlanSet.deleteMany({ userId }),
        ActivePlan.deleteMany({ userId }),
      ]);
      await Farm.updateOne({ _id: guestFarm._id }, { $set: { userId } });
      await PlanSet.updateMany({ userId: guest._id }, { $set: { userId } });
      await ActivePlan.updateMany({ userId: guest._id }, { $set: { userId } });
      outcome = 'adopted';
    } else {
      outcome = 'discarded';
    }
  }

  // whatever the guest still owns is removed, then the guest itself
  await Promise.all([
    Farm.deleteMany({ userId: guest._id }),
    PlanSet.deleteMany({ userId: guest._id }),
    ActivePlan.deleteMany({ userId: guest._id }),
  ]);
  await User.deleteOne({ _id: guest._id });
  return outcome;
}

// Never lets a problem with the guest data break a login or signup.
export async function claimGuestFromRequest(req, userId) {
  const raw = req.get(GUEST_HEADER);
  if (!raw || !GUEST_ID_RE.test(raw)) return undefined;
  try {
    return await claimGuestData(raw, userId);
  } catch (err) {
    logger.error({ err }, 'Guest data could not be moved to the account');
    return undefined;
  }
}