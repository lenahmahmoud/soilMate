import { OPTIONS } from '../constants/options.js';
import { toImageDto } from './cropMapper.js';
import { publicBaseUrl } from '../utils/publicUrl.js';
import { seasonProgress, itemStates } from '../utils/seasonProgress.js';

const SLOT_INFO = new Map(OPTIONS.slots.map((s) => [s.id, s]));

// Whitelist: only the contract's ActivePlan object leaves the server (no userId, planSetId, archivedAt, modelVersion).
// A crop that was removed from the catalog is skipped, like in farmMapper.
export function toActivePlanDto(plan, cropsById, { baseUrl = publicBaseUrl(), today = new Date() } = {}) {
  const items = plan.sequence.filter((item) => cropsById.has(item.cropId));
  const durations = items.map((item) => cropsById.get(item.cropId).attributes?.typicalDays ?? 0);
  const states = itemStates(seasonProgress({ startDate: plan.startDate, durations, today }), items.length);

  return {
    id: String(plan._id),
    planKey: plan.planKey,
    title: plan.title,
    chosenAt: new Date(plan.chosenAt).toISOString(),
    startDate: new Date(plan.startDate).toISOString().slice(0, 10),
    status: plan.status,
    sequence: items.map((item, i) => {
      const crop = cropsById.get(item.cropId);
      const info = SLOT_INFO.get(item.slot);
      return {
        slot: item.slot,
        seasonLabel: `Season ${info.order} · ${info.label}`,
        roleTag: item.roleTag ?? null,
        crop: {
          id: crop.id,
          name: crop.name,
          description: crop.description,
          image: toImageDto(crop, baseUrl),
        },
        calendar: {
          plantingLabel: crop.calendar?.plantingLabel ?? null,
          harvestLabel: crop.calendar?.harvestLabel ?? null,
        },
        state: states[i],
      };
    }),
    fit: plan.fit ?? [],
    seasonDetails: plan.seasonDetails ?? [],
    evidence: plan.evidence ?? [],
    infoGaps: plan.infoGaps ?? [],
    risksToReview: plan.risksToReview ?? [],
    dataConfidence: plan.dataConfidence ?? null,
  };
}