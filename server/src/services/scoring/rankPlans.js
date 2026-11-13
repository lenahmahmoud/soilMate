import { METRIC_IDS } from '../../constants/metrics.js';
import {
  BASE_WEIGHT,
  PRIORITY_BONUS,
  PRIORITY_TO_METRICS,
  RECOMMENDED_LABELS,
} from '../../constants/priorityWeights.js';

export function metricWeights(priorities = []) {
  const weights = Object.fromEntries(METRIC_IDS.map((id) => [id, BASE_WEIGHT]));
  for (const priority of priorities) {
    for (const id of PRIORITY_TO_METRICS[priority] ?? []) weights[id] += PRIORITY_BONUS;
  }
  return weights;
}

function matchScore(metrics, weights) {
  let total = 0;
  let weightSum = 0;
  for (const id of METRIC_IDS) {
    total += weights[id] * metrics[id].value;
    weightSum += weights[id];
  }
  return Math.round(total / weightSum);
}

// An empty plan (the farmer has not built a rotation yet) has no scores and is never ranked.
const isEmpty = (plan) => plan.empty === true || !plan.metrics;

// plans: [{ number?, empty?, metrics: { water: { value }, ... } }]. Returns one result per plan, in the same order:
// { matchScore, rank, recommended, recommendedLabel }. Ties: the lower plan number wins.
// Empty plans get { matchScore: null, rank: null, recommended: false, recommendedLabel: null }.
export function rankPlans(plans, priorities = []) {
  const weights = metricWeights(priorities);
  const scored = plans.map((plan, index) => ({
    index,
    empty: isEmpty(plan),
    number: plan.number ?? index + 1,
    score: isEmpty(plan) ? null : matchScore(plan.metrics, weights),
  }));

  const ordered = scored
    .filter((item) => !item.empty)
    .sort((a, b) => b.score - a.score || a.number - b.number);
  const rankOf = new Map(ordered.map((item, position) => [item.index, position + 1]));
  const label = RECOMMENDED_LABELS[priorities[0]] ?? null;

  return scored.map((item) => {
    if (item.empty) return { matchScore: null, rank: null, recommended: false, recommendedLabel: null };
    const rank = rankOf.get(item.index);
    const recommended = rank === 1;
    return {
      matchScore: item.score,
      rank,
      recommended,
      recommendedLabel: recommended ? label : null,
    };
  });
}