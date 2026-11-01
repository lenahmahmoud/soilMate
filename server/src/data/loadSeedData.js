import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.dirname(fileURLToPath(import.meta.url));

export const ICON_KEYS_PATH = path.join(dataDir, 'icon-keys.json');

const QUESTION_FILES = ['g1.json', 'g2.json', 'g3.json', 'g4.json', 'g5.json'];

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read ${file}: ${err.message}`);
  }
}

function asList(data, prop, file) {
  const list = Array.isArray(data) ? data : data?.[prop];
  if (!Array.isArray(list)) {
    throw new Error(`${file} must be an array (or an object with a "${prop}" array)`);
  }
  return list;
}

export function loadSeedData(dir = dataDir, iconKeysPath = ICON_KEYS_PATH) {
  const files = ['games.json', ...QUESTION_FILES].map((f) => path.join(dir, f));
  const missing = [...files, iconKeysPath].filter((f) => !existsSync(f));
  if (missing.length) {
    throw new Error(`Missing seed files:\n${missing.map((f) => `  - ${f}`).join('\n')}`);
  }

  const games = asList(readJson(path.join(dir, 'games.json')), 'games', 'games.json');
  const questions = QUESTION_FILES.flatMap((f) =>
    asList(readJson(path.join(dir, f)), 'questions', f),
  );

  const rawIcons = readJson(iconKeysPath);
  const iconKeys = Array.isArray(rawIcons) ? rawIcons : rawIcons?.keys;
  if (!Array.isArray(iconKeys) || !iconKeys.every((k) => typeof k === 'string')) {
    throw new Error('icon-keys.json must be an array of strings (or { "keys": [...] })');
  }

  return { games, questions, iconKeys };
}