import { connectDB, disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import Farm from '../models/Farm.js';
import ActivePlan from '../models/ActivePlan.js';
import { GUEST_TTL_DAYS } from '../constants/guest.js';

// Run it now and then (a weekly scheduled job is enough): npm run cleanup:guests
async function main() {
  await connectDB();
  try {
    const cutoff = new Date(Date.now() - GUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
    const old = await User.find({
      isGuest: true,
      $or: [{ lastSeenAt: { $lt: cutoff } }, { lastSeenAt: null }],
    })
      .select('_id')
      .lean();
    const ids = old.map((u) => u._id);
    if (ids.length) {
      await Promise.all([
        Farm.deleteMany({ userId: { $in: ids } }),
        ActivePlan.deleteMany({ userId: { $in: ids } }),
      ]);
      await User.deleteMany({ _id: { $in: ids } });
    }
    console.log(`Removed ${ids.length} guest(s) not seen for ${GUEST_TTL_DAYS} days.`);
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});