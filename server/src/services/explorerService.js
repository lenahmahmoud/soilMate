import { CENTERS } from '../constants/centers.js';
import { COVERAGE_NOTE, LAYERS, NDVI_FACE, NDVI_LEVEL_LABELS, SM_FILL_HEX } from '../constants/layers.js';
import { getLayerData } from '../data/loadLayerData.js';

const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;
const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Center + bbox + mapCenter. bbox comes from the NDVI file; mapCenter is only the middle of that box. */
function centerView(c) {
  const bbox = getLayerData().ndvi.centers[c.id].bbox; // [west, south, east, north]
  const [west, south, east, north] = bbox;
  return {
    id: c.id,
    name: c.name,
    nameAr: c.nameAr,
    governorate: c.governorate,
    bbox,
    mapCenter: { lat: round((south + north) / 2, 4), lon: round((west + east) / 2, 4) },
  };
}

export function getCenterView(centerId) {
  const c = CENTERS.find((x) => x.id === centerId);
  return c ? centerView(c) : null;
}

/** q matches name, Arabic name or governorate (case-insensitive "includes"). Empty q returns all 3. */
export function searchCenters(q = '') {
  const needle = String(q).trim().toLowerCase().slice(0, 100);
  const found = needle
    ? CENTERS.filter((c) => [c.name, c.nameAr, c.governorate].some((v) => v.toLowerCase().includes(needle)))
    : CENTERS;
  return { centers: found.map(centerView), coverageNote: COVERAGE_NOTE };
}

export function listLayers() {
  return LAYERS.map((l) => ({ ...l }));
}

const base = (c) => ({ centerId: c.id, name: c.name, bbox: getLayerData().ndvi.centers[c.id].bbox });

function cropHealth() {
  const { ndvi } = getLayerData();
  return {
    dataThrough: ndvi.meta.period.to,
    legend: {
      type: 'gradient',
      unit: 'NDVI',
      stops: ndvi.ui.ndvi_color_stops.map(([value, rgb]) => [value, toHex(rgb)]),
      items: Object.entries(NDVI_LEVEL_LABELS).map(([id, label]) => ({ id, label })),
    },
    centers: CENTERS.map((c) => {
      const { latest } = ndvi.centers[c.id];
      const value = round(latest.ndvi, 2); // display precision required by the contract; raw value stays in the detail endpoint
      return {
        ...base(c),
        value,
        valueLabel: value.toFixed(2),
        levelId: latest.level.id,
        levelLabel: latest.level.label,
        fillHex: latest.map_fill_hex,
        face: NDVI_FACE[latest.level.id],
      };
    }),
  };
}

function soilMoisture() {
  const { soilMoisture: sm } = getLayerData();
  const labels = sm.meta.state_labels;
  return {
    dataThrough: sm.meta.last_shared_month,
    legend: {
      type: 'categories',
      unit: 'Needle (0–100)',
      items: Object.keys(SM_FILL_HEX).map((id) => ({ id, label: labels[id], hex: SM_FILL_HEX[id] })),
    },
    centers: CENTERS.map((c) => {
      const row = sm.card[c.id][0];
      return {
        ...base(c),
        value: row.sm_needle,
        valueLabel: String(row.sm_needle),
        levelId: row.sm_state,
        levelLabel: labels[row.sm_state],
        fillHex: SM_FILL_HEX[row.sm_state],
        modelState: row.model_state,
        modelNeedle: row.model_needle,
      };
    }),
  };
}

function heatStress() {
  const { heat } = getLayerData();
  return {
    dataThrough: heat.meta.end.slice(0, 7),
    legend: { type: 'rank', unit: `Hot days per year (${heat.defaults.threshold} °C+)`, items: [] },
    centers: CENTERS.map((c) => {
      const value = heat.summary_default[c.id].heat_days_per_year;
      // No heat levels exist in the data yet (guide section 17, issue 8): the frontend shades by rank.
      return { ...base(c), value, valueLabel: String(value), levelId: null, levelLabel: null, fillHex: null };
    }),
  };
}

function overview() {
  const { atlas } = getLayerData();
  const end = /(\d{4}-\d{2})\s*$/.exec(atlas.method.period);
  return {
    dataThrough: end ? end[1] : null,
    legend: {
      type: 'categories',
      unit: 'Land risk score (1–3)',
      items: ['low', 'medium', 'high'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1), hex: atlas.statusColors[id] })),
    },
    centers: CENTERS.map((c) => {
      const { risk } = atlas.points[c.id];
      const levelId = risk.level.toLowerCase();
      return {
        ...base(c),
        value: risk.score,
        valueLabel: risk.score.toFixed(2),
        levelId,
        levelLabel: risk.level,
        fillHex: atlas.statusColors[levelId],
      };
    }),
  };
}

const BUILDERS = { crop_health: cropHealth, soil_moisture: soilMoisture, heat_stress: heatStress, overview };

/** Returns { kind: 'ok', body } | { kind: 'unavailable', reason } | { kind: 'unknown' }. */
export function getMapLayer(layerId) {
  const layer = LAYERS.find((l) => l.id === layerId);
  if (!layer) return { kind: 'unknown' };
  if (!layer.available) return { kind: 'unavailable', reason: layer.unavailableReason };
  return { kind: 'ok', body: { layerId: layer.id, label: layer.label, ...BUILDERS[layer.id]() } };
}