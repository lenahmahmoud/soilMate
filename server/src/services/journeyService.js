import Farm from '../models/Farm.js';
import ActivePlan from '../models/ActivePlan.js';
import { JOURNEY_STEPS } from '../constants/journey.js';
import { FALLOW } from '../constants/rotationLab.js';

// 13.4 + C10. Reads only; never creates a farm.
export async function getJourney(userId) {
  const [farm, activePlan] = await Promise.all([
    Farm.findOne({ userId }).select('centerId setupStatus rotationInput').lean(),
    ActivePlan.exists({ userId, archivedAt: null }),
  ]);

  const { winter, summer } = farm?.rotationInput ?? {};
  const hasRotation = [winter, summer].some((v) => v && v !== FALLOW);

  const done = {
    explore: Boolean(farm?.centerId),
    farm: farm?.setupStatus === 'complete',
    lab: hasRotation, // C10: a saved rotation with at least one crop
    compare: Boolean(activePlan), // CS-A4: the Compare step is done when a plan is chosen
    dashboard: Boolean(activePlan), // C10: the Dashboard step is done when a plan was chosen
  };

  const current = JOURNEY_STEPS.find((s) => !done[s.id]) ?? JOURNEY_STEPS[JOURNEY_STEPS.length - 1];
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