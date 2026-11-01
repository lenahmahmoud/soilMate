import { readFileSync } from 'node:fs';
import { G2_ANSWER_GROUPS, G3_POWER_GROUPS } from '../../src/constants/enums.js';

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../../src/data/${name}`, import.meta.url), 'utf8'));

const pad = (i) => String(i).padStart(3, '0');
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

const abc = () =>
  ['a', 'b', 'c'].map((key) => ({
    key,
    label: key === 'a' ? 'Right answer' : `Wrong answer ${key}`,
    iconKey: `fix-${key}`,
  }));

const G2_CHOICES = [
  { key: 'satellite', label: 'Satellite', iconKey: 'choice-satellite' },
  { key: 'both', label: 'Both Together', iconKey: 'choice-both-together' },
  { key: 'ground', label: 'On the Ground', iconKey: 'choice-on-the-ground' },
];

const base = (n, slug, i) => ({
  key: `g${n}-${pad(i)}`,
  gameSlug: slug,
  prompt: `Prompt ${n}-${i}`,
  explanation: `Explanation ${n}-${i}.`,
  active: true,
});

const item = (prefix, i) => ({ key: `${prefix}-${i}`, label: `${prefix} ${i}`, iconKey: `${prefix}-${i}` });

function collectIconKeys(games, questions) {
  const keys = new Set();
  for (const g of games) {
    keys.add(g.badge.iconKey);
    g.recapChips.forEach((c) => keys.add(c.iconKey));
  }
  for (const q of questions) {
    q.choices.forEach((c) => keys.add(c.iconKey));
    for (const k of [q.illustrationKey, q.illustrationFixedKey, q.collectionItem?.iconKey]) {
      if (k) keys.add(k);
    }
  }
  return [...keys];
}

// Returns a fresh copy every call, so tests can change it freely.
export function buildPool() {
  const games = read('games.json');

  const g2 = range(30).map((i) => {
    const group = G2_ANSWER_GROUPS[(i - 1) % 3];
    return {
      ...base(2, 'satellite-or-ground', i),
      choices: structuredClone(G2_CHOICES),
      correctChoiceKey: group,
      group,
    };
  });

  const g3 = range(30).map((i) => {
    const group = G3_POWER_GROUPS[(i - 1) % 8];
    return {
      ...base(3, 'crop-superpowers', i),
      illustrationKey: `crop-${i}`,
      choices: abc(),
      correctChoiceKey: 'a',
      group,
      collectionItem: item('power', group.toLowerCase()),
    };
  });

  const g4 = range(30).map((i) => ({
    ...base(4, 'fix-the-field', i),
    illustrationKey: 'fix-problem',
    illustrationFixedKey: 'fix-fixed',
    choices: abc(),
    correctChoiceKey: 'a',
    collectionItem: item('tile', i),
  }));

  const g5 = range(30).map((i) => ({
    ...base(5, 'weather-and-crops', i),
    illustrationKey: 'scene-weather',
    resultAnimationKey: 'anim-hot',
    choices: abc(),
    correctChoiceKey: 'a',
    collectionItem: item('sticker', i),
  }));

  const questions = [...read('g1.json'), ...g2, ...g3, ...g4, ...g5];
  return { games, questions, iconKeys: collectIconKeys(games, questions) };
}