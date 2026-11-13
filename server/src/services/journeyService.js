import Farm from '../models/Farm.js';
import ActivePlan from '../models/ActivePlan.js';
import { JOURNEY_STEPS } from '../constants/journey.js';

// 13.4. Reads only; never creates a farm.
export async function getJourney(userId) {
  const [farm, activePlan] = await Promise.all([
    Farm.findOne({ userId }).select('centerId setupStatus draftSequence').lean(),
    ActivePlan.exists({ userId, archivedAt: null }),
  ]);
  const hasPlan = Boolean(activePlan);

  const done = {
    explore: Boolean(farm?.centerId),
    farm: farm?.setupStatus === 'complete',
    lab: (farm?.draftSequence?.length ?? 0) === 3 || hasPlan, // the Lab is optional (A31)
    compare: hasPlan,
    dashboard: false, // the last step is never "done", so there is always a current step
  };

  const current = JOURNEY_STEPS.find((s) => !done[s.id]);
  return {
    steps: JOURNEY_STEPS.map(({ id, label, route }) => ({
      id,
      label,
      route,
      status: done[id] ? 'done' : id === current.id ? 'current' : 'upcoming',
    })),
    current: current.id,
    nextRoute: current.route,
  };
}