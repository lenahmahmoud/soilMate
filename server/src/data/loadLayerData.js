import fs from 'node:fs';
import path from 'node:path';
import { CENTER_IDS } from '../constants/centers.js';

const SM_PER_CENTER = { calendar: 123, typical_year: 36, years_strip: 11 };
const HEAT_N = 4018;

let cache = null;

function fail(msg) {
  throw new Error(`[layer-data] ${msg}`);
}

function readJson(dir, rel) {
  const file = path.join(dir, rel);
  if (!fs.existsSync(file)) fail(`missing file: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fail(`invalid JSON in ${file}: ${e.message}`);
  }
}

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function req(cond, msg) {
  if (!cond) fail(msg);
}

function byCenter(rows, name, perCenter) {
  req(Array.isArray(rows), `${name}: expected an array`);
  const out = {};
  for (const r of rows) {
    req(CENTER_IDS.includes(r.center), `${name}: unknown center "${r.center}"`);
    (out[r.center] ||= []).push(r);
  }
  req(
    Object.keys(out).length === CENTER_IDS.length,
    `${name}: must contain exactly the centers ${CENTER_IDS.join(', ')}`,
  );
  for (const id of CENTER_IDS) {
    req(out[id].length === perCenter, `${name}: ${id} has ${out[id].length} rows, expected ${perCenter}`);
  }
  return out;
}

function loadSoilMoisture(dir) {
  const d = 'soil_moisture';
  const calendar = byCenter(readJson(dir, `${d}/sm_calendar.json`), 'sm_calendar', SM_PER_CENTER.calendar);
  const card = byCenter(readJson(dir, `${d}/sm_card.json`), 'sm_card', 1);
  const agreement = byCenter(readJson(dir, `${d}/sm_agreement.json`), 'sm_agreement', 1);
  const typicalYear = byCenter(readJson(dir, `${d}/sm_typical_year.json`), 'sm_typical_year', SM_PER_CENTER.typical_year);
  const yearsStrip = byCenter(readJson(dir, `${d}/sm_years_strip.json`), 'sm_years_strip', SM_PER_CENTER.years_strip);
  const texts = readJson(dir, `${d}/texts_soil_moisture.json`);
  const meta = readJson(dir, `${d}/sm_meta.json`);
  const sources = readJson(dir, `${d}/sources.json`);
  const glossary = readJson(dir, `${d}/glossary.json`);

  req(texts.shared && Array.isArray(texts.shared.limits), 'texts_soil_moisture: shared.limits missing');
  req(isStr(texts.shared.footer), 'texts_soil_moisture: shared.footer is empty');
  for (const id of CENTER_IDS) {
    const t = texts.centers?.[id];
    req(t, `texts_soil_moisture: no texts for ${id}`);
    req(isStr(t.display_name), `texts_soil_moisture: ${id}.display_name is empty`);
    for (const k of ['card', 'insight1_calendar', 'insight2_typical_year', 'insight3_years',
      'insight4_satellite_vs_model', 'insight5_root', 'report']) {
      req(t[k] && typeof t[k] === 'object', `texts_soil_moisture: ${id}.${k} missing`);
    }
    for (const k of ['observed', 'may_mean', 'to_verify']) {
      req(isStr(t.report[k]), `texts_soil_moisture: ${id}.report.${k} is empty`);
    }
  }
  req(Array.isArray(sources) && sources.length > 0, 'sources.json: expected a non-empty array');
  req(Array.isArray(glossary) && glossary.length > 0, 'glossary.json: expected a non-empty array');
  req(isStr(meta.last_shared_month), 'sm_meta: last_shared_month missing');

  return { calendar, card, agreement, typicalYear, yearsStrip, texts, meta, sources, glossary };
}

function loadNdvi(dir) {
  const raw = readJson(dir, 'ndvi/ndvi_feature.json');
  req(raw.centers && typeof raw.centers === 'object', 'ndvi_feature: centers missing');
  req(raw.charts && ['A', 'B', 'E'].every((k) => raw.charts[k]), 'ndvi_feature: charts A, B and E are required');

  const centers = {};
  for (const [key, value] of Object.entries(raw.centers)) centers[key.toLowerCase()] = value;
  req(
    CENTER_IDS.length === Object.keys(centers).length && CENTER_IDS.every((id) => centers[id]),
    `ndvi_feature: centers must be exactly ${CENTER_IDS.join(', ')}`,
  );
  for (const id of CENTER_IDS) {
    const c = centers[id];
    req(Array.isArray(c.bbox) && c.bbox.length === 4 && c.bbox.every(isNum), `ndvi_feature: ${id}.bbox must be 4 numbers`);
    req(c.latest && typeof c.latest === 'object', `ndvi_feature: ${id}.latest missing`);
    req(c.summary_card && typeof c.summary_card === 'object', `ndvi_feature: ${id}.summary_card missing`);
    req(Array.isArray(c.insights) && c.insights.length === 6, `ndvi_feature: ${id}.insights must have 6 items`);
    req(Array.isArray(c.monthly_series) && c.monthly_series.length === 123, `ndvi_feature: ${id}.monthly_series must have 123 items`);
  }
  return { meta: raw.meta, ui: raw.ui, tiles: raw.tiles, charts: raw.charts, centers };
}

function loadHeat(dir) {
  const h = readJson(dir, 'heat/heat_stress_data.json');
  req(h.n === HEAT_N, `heat: n is ${h.n}, expected ${HEAT_N}`);
  req(Array.isArray(h.order) && h.order.length === CENTER_IDS.length && CENTER_IDS.every((id) => h.order.includes(id)),
    'heat: order must list exactly the 3 centers');
  for (const id of CENTER_IDS) {
    req(Array.isArray(h.xy?.[id]) && h.xy[id].length === 2, `heat: xy.${id} missing`);
    req(h.summary_default?.[id], `heat: summary_default.${id} missing`);
    req(h.cmp?.ag?.[id], `heat: cmp.ag.${id} missing`);
    req(h.cmp?.cal?.[id], `heat: cmp.cal.${id} missing`);
    req(h.cmp?.typ?.[id], `heat: cmp.typ.${id} missing`);
    req(h.grid?.[id], `heat: grid.${id} missing`);
  }
  for (const grid of new Set(Object.values(h.grid))) {
    const dl = h.daily?.[grid];
    req(dl, `heat: daily.${grid} missing`);
    for (const k of ['tmax', 'tmin', 'tmean', 'hum', 'rain', 'root']) {
      req(Array.isArray(dl[k]) && dl[k].length === h.n, `heat: daily.${grid}.${k} must have ${h.n} values`);
    }
  }
  req(Array.isArray(h.gl) && h.gl.length > 0, 'heat: gl (glossary) missing');
  req(Array.isArray(h.src) && h.src.length > 0, 'heat: src (sources) missing');
  req(h.sh && Array.isArray(h.sh.limits) && isStr(h.sh.footer), 'heat: sh.footer / sh.limits missing');
  return h;
}

function loadAtlas(dir) {
  const a = readJson(dir, 'atlas/desertification_atlas.json');
  req(a.points && typeof a.points === 'object', 'atlas: points missing');
  req(a.method && a.status_colors && Array.isArray(a.chart_catalog), 'atlas: method, status_colors and chart_catalog are required');

  const points = {};
  for (const p of Object.values(a.points)) points[p.id] = p; // use "id", ignore "key"
  req(
    Object.keys(points).length === CENTER_IDS.length && CENTER_IDS.every((id) => points[id]),
    `atlas: points must be exactly ${CENTER_IDS.join(', ')}`,
  );
  for (const id of CENTER_IDS) {
    const p = points[id];
    req(p.risk && isNum(p.risk.score) && isStr(p.risk.level), `atlas: ${id}.risk is incomplete`);
    req(Array.isArray(p.signs) && p.signs.length === 4, `atlas: ${id}.signs must have 4 items`);
    req(p.trends && typeof p.trends === 'object', `atlas: ${id}.trends missing`);
    req(p.report && typeof p.report === 'object', `atlas: ${id}.report missing`);
    // salinity is not measured, so label it honestly
    const sal = p.signs.find((s) => s.id === 'salinity');
    if (sal) sal.question = 'Coast exposure (distance only)';
  }
  const cat = a.chart_catalog.find((c) => c.id === 'sign_salinity');
  if (cat) cat.title = 'Coast exposure (distance only)';

  return { method: a.method, statusColors: a.status_colors, chartCatalog: a.chart_catalog, points };
}

/** Loads and validates every layer file. Throws on the first problem. */
export function loadLayerData(dir) {
  const root = path.resolve(dir);
  return {
    soilMoisture: loadSoilMoisture(root),
    ndvi: loadNdvi(root),
    heat: loadHeat(root),
    atlas: loadAtlas(root),
  };
}

export function initLayerData(dir) {
  cache = loadLayerData(dir);
  return cache;
}

export function getLayerData() {
  if (!cache) throw new Error('[layer-data] not loaded: call initLayerData() at startup');
  return cache;
}

export function resetLayerData() {
  cache = null;
}