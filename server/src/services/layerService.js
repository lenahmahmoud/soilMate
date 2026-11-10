import { CENTER_IDS } from '../constants/centers.js';
import { LAND_RISK_NOTICE, LAND_RISK_TITLE, SIGN_LABELS } from '../constants/layers.js';
import { getLayerData } from '../data/loadLayerData.js';
import { getCenterView } from './explorerService.js';

// Detail endpoints return the data team's content for ONE center, unmodified (inner keys keep the data team's
// names). Only the top-level wrapper keys below are named by the contract. Nothing here recalculates a number,
// and nothing mutates the loaded data: responses only reference it.

const round2 = (n) => Math.round(n * 100) / 100;
const known = (centerId) => CENTER_IDS.includes(centerId);

export function getOverview(centerId) {
  if (!known(centerId)) return null;
  const { soilMoisture: sm, ndvi, heat, atlas } = getLayerData();
  const nd = ndvi.centers[centerId];
  const card = sm.card[centerId][0];
  const texts = sm.texts.centers[centerId];
  const heatSummary = heat.summary_default[centerId];
  const point = atlas.points[centerId];
  const labels = sm.meta.state_labels;
  const thr = heat.defaults.threshold;
  const ndviValue = round2(nd.latest.ndvi); // display precision, as in the contract example

  return {
    center: {
      ...getCenterView(centerId),
      site: {
        lat: point.lat,
        lon: point.lon,
        elevationM: point.elevation_m,
        slopeDeg: point.slope_deg,
        coastDistanceKm: point.coast.distance_km,
      },
    },
    dataThrough: {
      cropHealth: ndvi.meta.period.to,
      soilMoisture: sm.meta.last_shared_month,
      heatWeather: heat.meta.end.slice(0, 7),
      heatSatellite: heat.meta.sat_end,
    },
    areaWarning: texts.card.area_warning,
    tiles: [
      {
        id: 'crop_greenness', label: 'Crop greenness (NDVI)', value: ndviValue, display: ndviValue.toFixed(2),
        chip: { id: nd.latest.level.id, label: nd.latest.level.label },
      },
      {
        id: 'green_months', label: 'Green months (last 12)', value: nd.summary_card.green_pct_last12,
        display: `${nd.summary_card.green_pct_last12}%`, chip: null,
      },
      { id: 'soil_moisture', label: 'Soil moisture (SMAP)', value: card.sm_state, display: labels[card.sm_state], chip: null },
      {
        id: 'hot_days', label: `Hot days per year (${thr} °C+)`, value: heatSummary.heat_days_per_year,
        display: String(heatSummary.heat_days_per_year), chip: null,
      },
    ],
    heat: {
      title: 'Typical heat',
      avgHighC: heatSummary.avg_high,
      avgLowC: heatSummary.avg_low,
      hottestDay: { date: heatSummary.hottest[0], tmaxC: heatSummary.hottest[1] },
      heatDaysPerYear: heatSummary.heat_days_per_year,
      longestHotSpell: { days: heatSummary.longest_spell[0], from: heatSummary.longest_spell[1] },
      trendPerDecadeC: heatSummary.trend_per_decade,
      source: heat.src[0].name,
    },
    lastMonths: nd.summary_card.last4.map((m) => ({ short: m.short, ndvi: round2(m.ndvi), fillHex: m.fill_hex })),
    soilMoisture: {
      satellite: { state: card.sm_state, label: labels[card.sm_state], needle: card.sm_needle },
      model: { state: card.model_state, label: labels[card.model_state], needle: card.model_needle },
      rootZone: { state: card.root_state, label: labels[card.root_state], needle: card.root_needle },
      dryMonthsLast12: { satellite: card.dry_months_of_last12_sm, model: card.dry_months_of_last12_model },
      texts: {
        satelliteLine: texts.card.satellite_line,
        modelLine: texts.card.model_line,
        last12Line: texts.card.last12_line,
        disagreeNote: texts.card.disagree_note,
        needleNote: texts.card.needle_note,
      },
      confidenceLabels: {
        satellite: sm.texts.shared.confidence_labels.satellite,
        model: sm.texts.shared.confidence_labels.model,
      },
    },
    landRisk: {
      title: LAND_RISK_TITLE,
      score: point.risk.score,
      scaleMin: point.risk.scale_min,
      scaleMax: point.risk.scale_max,
      level: point.risk.level,
      levelHex: atlas.statusColors[point.risk.level.toLowerCase()],
      indicators: point.signs.map((s) => ({
        id: s.id, label: SIGN_LABELS[s.id] ?? s.question, status: s.status, score: s.score, text: s.text,
      })),
      notice: LAND_RISK_NOTICE,
    },
    disclaimer: ndvi.meta.disclaimer,
    footer: sm.texts.shared.footer,
  };
}

export function getCropHealth(centerId, { includeMonthly = false } = {}) {
  if (!known(centerId)) return null;
  const { ndvi } = getLayerData();
  const d = ndvi.centers[centerId];
  return {
    center: {
      id: centerId,
      name: d.name,
      chartKey: d.id, // the key this center has inside charts.*.series (e.g. "Sidi_Salem")
      color: d.color,
      bbox: d.bbox,
      latest: d.latest,
      summaryCard: d.summary_card,
      insights: d.insights,
      ...(includeMonthly ? { monthlySeries: d.monthly_series } : {}),
    },
    charts: ndvi.charts, // shared by design: all 3 centers, so the page can highlight the selected one
    ui: ndvi.ui,
    meta: {
      sources: ndvi.meta.sources,
      disclaimer: ndvi.meta.disclaimer,
      limits: ndvi.meta.limits,
      thresholds: ndvi.meta.thresholds,
    },
    dataThrough: ndvi.meta.period.to,
  };
}

export function getSoilMoisture(centerId) {
  if (!known(centerId)) return null;
  const { soilMoisture: sm } = getLayerData();
  const t = sm.texts.centers[centerId];
  return {
    card: sm.card[centerId][0],
    calendar: sm.calendar[centerId],
    typicalYear: sm.typicalYear[centerId],
    yearsStrip: sm.yearsStrip[centerId],
    agreement: sm.agreement[centerId][0],
    texts: {
      card: t.card,
      // insights keep the data team's key names (insight1_calendar, ..., insight5_root)
      ...Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('insight'))),
      report: t.report,
    },
    labels: {
      states: sm.meta.state_labels,
      agreementLevels: sm.meta.agreement_levels,
      confidence: sm.texts.shared.confidence_labels,
    },
    sources: sm.sources,
    limits: sm.texts.shared.limits,
    footer: sm.texts.shared.footer,
    dataThrough: sm.meta.last_shared_month,
  };
}

export function getHeatStress(centerId) {
  if (!known(centerId)) return null;
  const { heat } = getLayerData();
  // Fixed defaults only (35 °C, 2 SD). The 4018-value daily arrays are never sent.
  return {
    summary: heat.summary_default[centerId],
    comparison: { agreement: heat.cmp.ag[centerId], typicalYear: heat.cmp.typ[centerId] },
    texts: heat.tx.cmp[centerId],
    defaults: { thresholdC: heat.defaults.threshold, sigma: heat.defaults.sigma },
    labels: { agreementLevels: heat.lb.agreement_levels },
    limits: heat.sh.limits, // keeps the "area, not field" and shared-weather warnings with the heat data
    sources: heat.src,
    dataThrough: { weather: heat.meta.end.slice(0, 7), satellite: heat.meta.sat_end },
  };
}

export function getLandRisk(centerId) {
  if (!known(centerId)) return null;
  const { atlas } = getLayerData();
  const point = { ...atlas.points[centerId] };
  delete point.key; // "key" is the atlas's own id format and is ignored
  return { point, chartCatalog: atlas.chartCatalog, statusColors: atlas.statusColors, method: atlas.method };
}

/** Soil-moisture glossary + heat glossary, duplicates removed by lowercase term (first one wins). */
export function getGlossary() {
  const { soilMoisture: sm, heat } = getLayerData();
  const seen = new Set();
  const terms = [];
  for (const g of [...sm.glossary, ...heat.gl]) {
    const k = g.term.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    terms.push({ term: g.term, short: g.short, gameSection: g.game_section });
  }
  return { terms };
}