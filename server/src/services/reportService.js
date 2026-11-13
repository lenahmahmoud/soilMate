import { CENTERS } from '../constants/centers.js';
import { AppError } from '../utils/AppError.js';
import { getFarm } from './farmService.js';
import { getActivePlan } from './planService.js';
import { getSoilMoisture, getHeatStress, getLandRisk } from './layerService.js';

// 13.3: everything here is copied from existing data; nothing is calculated or written new.
export async function getReportSummary(userId) {
  const farm = await getFarm(userId);
  if (!farm.centerId) {
    throw new AppError(409, 'FARM_SETUP_INCOMPLETE', 'Pick your area before opening the report');
  }
  const center = CENTERS.find((c) => c.id === farm.centerId);
  const soil = getSoilMoisture(farm.centerId);
  const heat = getHeatStress(farm.centerId);
  const risk = getLandRisk(farm.centerId);
  const { activePlan } = await getActivePlan(userId);

  return {
    generatedAt: new Date().toISOString(),
    center: { id: center.id, name: center.name, governorate: center.governorate },
    farm,
    plan: activePlan,
    soilMoistureReport: soil.texts.report, // { observed, may_mean, to_verify }, as the data team wrote them
    landRiskReport: risk.point.report, // atlas report, unchanged
    limits: [...soil.limits, ...heat.limits],
    disclaimer: soil.footer,
  };
}