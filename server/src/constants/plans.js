import { PLAN_KEYS, AREA_PLAN_KEYS } from './soilmateEnums.js';

// PLAN_KEYS stays defined in soilmateEnums.js (the models import it from there); re-exported for convenience.
export { PLAN_KEYS, AREA_PLAN_KEYS };

// Plan 1 of the compare page: the farmer's own rotation from the Rotation Lab (guide 12.0b).
export const MY_PLAN = {
  planKey: 'my_plan',
  title: 'My Rotation',
  badge: { label: 'Your Plan', tone: 'info' },
  emptyMessage: 'Build your own rotation in the Rotation Lab to compare it here.',
};