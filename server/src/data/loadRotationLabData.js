import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CENTER_IDS } from "../constants/centers.js";
import {
  FALLOW,
  FALLOW_CROP,
  PLAN_TYPES,
  SEASONS,
  SUMMER_OPTIONS,
  WINTER_OPTIONS,
  rotationKey,
} from "../constants/rotationLab.js";

// Next to this file, so it does not depend on the working directory.
export const DEFAULT_DIR = fileURLToPath(new URL("./rotationlab/", import.meta.url));

export const FILES = Object.freeze({
  plans: "plans.json",
  meta: "meta.json",
  crops: "crops.json",
  centers: "centers.json",
  uiText: "ui_text.json",
  catalog: "crop_catalog.json",
});

let cache = null;

function fail(msg) {
  throw new Error(`[rotation-lab-data] ${msg}`);
}
function req(cond, msg) {
  if (!cond) fail(msg);
}
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

function readJson(dir, name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) fail(`missing file: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fail(`invalid JSON in ${file}: ${e.message}`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function expectedKeys() {
  const keys = [];
  for (const c of CENTER_IDS)
    for (const w of WINTER_OPTIONS)
      for (const s of SUMMER_OPTIONS) if (!(w === FALLOW && s === FALLOW)) keys.push(rotationKey(c, w, s));
  return keys;
}

function checkMeta(meta) {
  req(isObj(meta), "meta.json: expected an object");
  req(isStr(meta.version), "meta.json: version is empty");
  req(isStr(meta.disclaimer), "meta.json: disclaimer is empty");
  const rules = meta.input_rules;
  req(isObj(rules), "meta.json: input_rules missing");
  req(
    sameList(rules.winter_options, WINTER_OPTIONS),
    `meta.json: input_rules.winter_options must be ${WINTER_OPTIONS.join(", ")}`,
  );
  req(
    sameList(rules.summer_options, SUMMER_OPTIONS),
    `meta.json: input_rules.summer_options must be ${SUMMER_OPTIONS.join(", ")}`,
  );
  req(
    Array.isArray(rules.invalid) && isStr(rules.invalid[0]?.message),
    "meta.json: input_rules.invalid[0].message is empty",
  );
  req(
    isStr(meta.plan_selection?.water_saving) && isStr(meta.plan_selection?.soil_health),
    "meta.json: plan_selection texts are empty",
  );
  for (const k of ["assumptions", "limitations"]) {
    req(
      Array.isArray(meta[k]) && meta[k].length > 0 && meta[k].every(isStr),
      `meta.json: ${k} must be a non-empty list of texts`,
    );
  }
  req(isObj(meta.data_period), "meta.json: data_period missing");
}

function checkUiText(ui) {
  req(isObj(ui), "ui_text.json: expected an object");
  req(isStr(ui.version), "ui_text.json: version is empty");
  req(isStr(ui.disclaimer), "ui_text.json: disclaimer is empty");
}

function checkCenters(centers) {
  req(Array.isArray(centers), "centers.json: expected an array");
  const ids = centers.map((c) => c.id);
  req(
    ids.length === CENTER_IDS.length && CENTER_IDS.every((id) => ids.includes(id)),
    `centers.json: centers must be exactly ${CENTER_IDS.join(", ")}`,
  );
}

function sameSet(ids, options) {
  const want = options.filter((o) => o !== FALLOW);
  return ids.length === want.length && want.every((o) => ids.includes(o));
}

// The ONE crop source (C2): crop_catalog.json (display) joined with crops.json (traits) on id.
function joinCrops(catalog, crops) {
  req(isObj(catalog) && Array.isArray(catalog.crops), "crop_catalog.json: crops list missing");
  req(Array.isArray(crops), "crops.json: expected an array");

  const traitsById = new Map();
  for (const t of crops) {
    req(isStr(t.id), "crops.json: a crop has no id");
    req(!traitsById.has(t.id), `crops.json: duplicate id "${t.id}"`);
    traitsById.set(t.id, t);
  }
  const seen = new Set();
  const cropsById = new Map();
  const cropOrder = [];
  for (const c of catalog.crops) {
    req(isStr(c.id), "crop_catalog.json: a crop has no id");
    req(!seen.has(c.id), `crop_catalog.json: duplicate id "${c.id}"`);
    seen.add(c.id);
    const t = traitsById.get(c.id);
    req(t, `crop "${c.id}" is in crop_catalog.json but not in crops.json`);
    req(SEASONS.includes(c.season), `crop_catalog.json: ${c.id}.season must be winter or summer`);
    req(c.season === t.season, `crop "${c.id}": season differs between crop_catalog.json and crops.json`);
    req(isStr(c.name) && c.name === t.name, `crop "${c.id}": name is empty or differs between the two files`);
    req(isStr(c.description), `crop_catalog.json: ${c.id}.description is empty`);
    req(Array.isArray(c.role_tags), `crop_catalog.json: ${c.id}.role_tags must be a list`);
    req(
      isNum(t.season_length_days) && t.season_length_days > 0,
      `crops.json: ${c.id}.season_length_days must be a positive number`,
    );
    cropsById.set(c.id, {
      id: c.id,
      name: c.name,
      season: c.season,
      roleTags: c.role_tags,
      description: c.description,
      traits: t, // internal: never sent to the client
    });
    cropOrder.push(c.id);
  }
  for (const id of traitsById.keys()) {
    req(seen.has(id), `crop "${id}" is in crops.json but not in crop_catalog.json`);
  }
  req(!cropsById.has(FALLOW), `"${FALLOW}" must not be in the crop files (it is a constant)`);
  cropsById.set(FALLOW, FALLOW_CROP);

  const winter = cropOrder.filter((id) => cropsById.get(id).season === "winter");
  const summer = cropOrder.filter((id) => cropsById.get(id).season === "summer");
  req(sameSet(winter, WINTER_OPTIONS), "the winter crops differ from meta.input_rules.winter_options");
  req(sameSet(summer, SUMMER_OPTIONS), "the summer crops differ from meta.input_rules.summer_options");
  return { cropsById, cropOrder };
}

function checkPlans(plansFile) {
  req(isObj(plansFile) && isObj(plansFile.plans), "plans.json: expected { meta, plans }");
  const plans = plansFile.plans;
  const want = expectedKeys();
  const have = Object.keys(plans);
  req(have.length === want.length, `plans.json: has ${have.length} keys, expected ${want.length}`);
  for (const k of want) req(plans[k], `plans.json: missing key "${k}"`);
  for (const k of have) req(want.includes(k), `plans.json: unexpected key "${k}"`);

  for (const k of want) {
    const [center, winter, summer] = k.split("|");
    const r = plans[k];
    req(r.center === center, `plans.json: ${k}: center is "${r.center}"`);
    req(
      r.current_input?.winter === winter && r.current_input?.summer === summer,
      `plans.json: ${k}: current_input does not match the key`,
    );
    req(
      isObj(r.plans) && sameList(Object.keys(r.plans).sort(), [...PLAN_TYPES].sort()),
      `plans.json: ${k}: must have exactly the plans ${PLAN_TYPES.join(", ")}`,
    );
    for (const type of PLAN_TYPES) {
      const p = r.plans[type];
      const at = `plans.json: ${k}.${type}`;
      req(isObj(p), `${at}: missing`);
      req(isObj(p.numbers), `${at}: numbers missing`);
      req(Array.isArray(p.warnings), `${at}: warnings must be a list`);
      req(isObj(p.text) && isStr(p.text.reason), `${at}: text.reason is empty`);
      for (const f of ["evidence", "benefits", "gaps", "risks"]) {
        req(
          Array.isArray(p.text[f]) && p.text[f].length > 0 && p.text[f].every(isStr),
          `${at}: text.${f} is empty`,
        );
      }
    }
  }
}

/** Loads and validates the six Rotation Lab files. Throws on the first problem. `onWarn(msg)` gets soft warnings. */
export function loadRotationLabData(dir = DEFAULT_DIR, { onWarn = () => {} } = {}) {
  const root = path.resolve(dir);
  const raw = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readJson(root, f)]));

  checkMeta(raw.meta);
  checkUiText(raw.uiText);
  checkCenters(raw.centers);
  const { cropsById, cropOrder } = joinCrops(raw.catalog, raw.crops);
  checkPlans(raw.plans);

  if (raw.meta.version !== raw.uiText.version) {
    onWarn(`meta.json version "${raw.meta.version}" differs from ui_text.json version "${raw.uiText.version}"`);
  }

  // Object.freeze does not reach inside a Map, so freeze the values before they go in.
  const plansByKey = new Map(Object.entries(deepFreeze(raw.plans.plans)));
  for (const crop of cropsById.values()) deepFreeze(crop);
  return Object.freeze({
    meta: deepFreeze(raw.meta),
    uiText: deepFreeze(raw.uiText),
    centers: deepFreeze(raw.centers),
    plansByKey,
    cropsById,
    cropOrder: Object.freeze(cropOrder),
  });
}

export function initRotationLabData(dir = DEFAULT_DIR, options) {
  cache = loadRotationLabData(dir, options);
  return cache;
}

// Lazy: a test (or script) that never called init still works. server.js calls init at boot to fail fast.
export function getRotationLabData() {
  return cache ?? initRotationLabData();
}

export function resetRotationLabData() {
  cache = null;
}