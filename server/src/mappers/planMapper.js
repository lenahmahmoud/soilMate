import { getRotationLabData } from '../data/loadRotationLabData.js';

// Whitelist: userId, archivedAt and __v never leave. The chosen plan is returned UNCHANGED (C8).
// A document of the retired plan shape (no key, no input) must not break the endpoint: it is
// reported without a plan and with dataChangedSinceChosen, and the migration removes it.
export function toActivePlanDto(doc) {
  const { plansByKey, meta } = getRotationLabData();
  const key = doc.key ?? null;
  const input = doc.input ?? null;
  const plan = key ? (plansByKey.get(key)?.plans?.[doc.planKey] ?? null) : null;

  const dto = {
    id: String(doc._id),
    planKey: doc.planKey,
    key,
    input: input ? { center: input.center, winter: input.winter, summer: input.summer } : null,
    startDate: doc.startDate ? new Date(doc.startDate).toISOString().slice(0, 10) : null,
    chosenAt: doc.chosenAt ? new Date(doc.chosenAt).toISOString() : null,
    dataVersion: doc.dataVersion ?? null,
    plan,
  };
  // The data files were replaced after the farmer chose: the plan above is the CURRENT one.
  if (plan === null || (doc.dataVersion && doc.dataVersion !== meta.version)) {
    dto.dataChangedSinceChosen = true;
  }
  return dto;
}
