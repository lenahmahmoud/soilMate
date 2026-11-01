import { GAME_SLUGS, G2_ANSWER_GROUPS, G3_POWER_GROUPS } from '../constants/enums.js';

const ACTIVE_COUNT = {
  'match-the-word': 6,
  'satellite-or-ground': 30,
  'crop-superpowers': 30,
  'fix-the-field': 30,
  'weather-and-crops': 30,
};

const G2_FIXED_CHOICES = [
  { key: 'satellite', label: 'Satellite', iconKey: 'choice-satellite' },
  { key: 'both', label: 'Both Together', iconKey: 'choice-both-together' },
  { key: 'ground', label: 'On the Ground', iconKey: 'choice-on-the-ground' },
];

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

function checkGames(games, ctx) {
  const slugs = games.map((g) => g?.slug);

  for (const slug of GAME_SLUGS) {
    const n = slugs.filter((s) => s === slug).length;
    if (n !== 1) ctx.fail(`games.json: expected exactly 1 game "${slug}", found ${n}`);
  }
  for (const slug of slugs) {
    if (!GAME_SLUGS.includes(slug)) ctx.fail(`games.json: unknown slug "${slug}"`);
  }

  for (const g of games) {
    const where = `games.json [${g?.slug}]`;
    ctx.needIcon(`${where} badge`, g?.badge?.iconKey);
    (g?.recapChips ?? []).forEach((chip, i) =>
      ctx.needIcon(`${where} recapChips[${i}]`, chip?.iconKey),
    );

    if (g?.slug === 'weather-and-crops') {
      if (g.nextGameSlug !== null) ctx.fail(`${where}: nextGameSlug must be null`);
    } else if (g?.nextGameSlug == null) {
      ctx.fail(`${where}: nextGameSlug can be null only for weather-and-crops`);
    } else if (g.nextGameSlug === g.slug || !slugs.includes(g.nextGameSlug)) {
      ctx.fail(`${where}: nextGameSlug "${g.nextGameSlug}" does not point to another game`);
    }
  }
}

function checkQuestion(q, where, ctx) {
  const slug = q.gameSlug;

  if (!isText(q.prompt)) ctx.fail(`${where}: prompt is missing`);
  if (!isText(q.explanation)) ctx.fail(`${where}: explanation is missing`);
  if (!Array.isArray(q.choices)) {
    ctx.fail(`${where}: choices must be an array`);
    return;
  }

  const choices = q.choices;
  const keys = choices.map((c) => c?.key);
  if (new Set(keys).size !== keys.length) ctx.fail(`${where}: choice keys are not unique`);
  choices.forEach((c, i) => ctx.needIcon(`${where} choices[${i}]`, c?.iconKey));
  if (!keys.includes(q.correctChoiceKey)) {
    ctx.fail(`${where}: correctChoiceKey "${q.correctChoiceKey}" is not in choices`);
  }

  ctx.optionalIcon(`${where} illustrationKey`, q.illustrationKey);
  ctx.optionalIcon(`${where} illustrationFixedKey`, q.illustrationFixedKey);

  if (slug === 'match-the-word') {
    if (choices.length !== 1) ctx.fail(`${where}: Game 1 must have exactly 1 choice`);
    if (q.correctChoiceKey !== q.key) {
      ctx.fail(`${where}: Game 1 correctChoiceKey must equal the question key`);
    }
  } else {
    if (choices.length !== 3) ctx.fail(`${where}: must have exactly 3 choices`);
    const correct = choices.find((c) => c?.key === q.correctChoiceKey);
    if (correct) {
      for (const c of choices) {
        if (c !== correct && c?.label === correct.label) {
          ctx.fail(`${where}: wrong choice "${c?.key}" has the same label as the correct choice`);
        }
      }
    }
  }

  if (slug === 'satellite-or-ground') {
    const fixed =
      choices.length === 3 &&
      G2_FIXED_CHOICES.every(
        (f, i) =>
          choices[i]?.key === f.key &&
          choices[i]?.label === f.label &&
          choices[i]?.iconKey === f.iconKey,
      );
    if (!fixed) {
      ctx.fail(
        `${where}: Game 2 choices must be exactly satellite, both, ground in that order with the fixed labels and icons`,
      );
    }
    if (!G2_ANSWER_GROUPS.includes(q.group)) {
      ctx.fail(`${where}: Game 2 group must be satellite, both or ground`);
    } else if (q.correctChoiceKey !== q.group) {
      ctx.fail(`${where}: Game 2 correctChoiceKey must equal the group`);
    }
    if (q.collectionItem) ctx.fail(`${where}: Game 2 must not have a collectionItem`);
  } else if (!q.collectionItem) {
    ctx.fail(`${where}: missing collectionItem`);
  } else {
    ctx.needIcon(`${where} collectionItem`, q.collectionItem.iconKey);
  }

  if (slug === 'crop-superpowers' && !G3_POWER_GROUPS.includes(q.group)) {
    ctx.fail(`${where}: Game 3 group must be one of A to H`);
  }
  if (slug === 'fix-the-field') {
    if (!isText(q.illustrationKey)) ctx.fail(`${where}: Game 4 needs illustrationKey`);
    if (!isText(q.illustrationFixedKey)) ctx.fail(`${where}: Game 4 needs illustrationFixedKey`);
  }
  if (slug === 'weather-and-crops') {
    if (!isText(q.illustrationKey)) ctx.fail(`${where}: Game 5 needs illustrationKey`);
    if (!isText(q.resultAnimationKey)) ctx.fail(`${where}: Game 5 needs resultAnimationKey`);
  }
}

function checkQuestions(questions, ctx) {
  const seen = new Set();
  const active = Object.fromEntries(GAME_SLUGS.map((s) => [s, []]));

  for (const q of questions) {
    const where = `question ${q?.key ?? '(no key)'}`;
    if (!isText(q?.key)) {
      ctx.fail(`${where}: key is missing`);
      continue;
    }
    if (seen.has(q.key)) ctx.fail(`${where}: duplicate key`);
    seen.add(q.key);

    if (!GAME_SLUGS.includes(q.gameSlug)) {
      ctx.fail(`${where}: unknown gameSlug "${q.gameSlug}"`);
      continue;
    }
    if (q.active !== false) active[q.gameSlug].push(q);
    checkQuestion(q, where, ctx);
  }

  for (const slug of GAME_SLUGS) {
    const n = active[slug].length;
    if (n !== ACTIVE_COUNT[slug]) {
      ctx.fail(`Game "${slug}" has ${n} active questions, expected ${ACTIVE_COUNT[slug]}`);
    }
  }
  for (const group of G2_ANSWER_GROUPS) {
    const n = active['satellite-or-ground'].filter((q) => q.group === group).length;
    if (n !== 10) ctx.fail(`Game 2: group "${group}" has ${n} active questions, expected 10`);
  }
  for (const group of G3_POWER_GROUPS) {
    const n = active['crop-superpowers'].filter((q) => q.group === group).length;
    if (n < 3) ctx.fail(`Game 3: group ${group} has ${n} crops, needs at least 3`);
  }
}

// Returns a list of problems. An empty list means the pool is valid.
export function validatePool({ games, questions, iconKeys }) {
  const errors = [];
  const icons = new Set(iconKeys);

  const ctx = {
    fail: (msg) => errors.push(msg),
    needIcon(where, key) {
      if (!isText(key)) errors.push(`${where}: iconKey is missing`);
      else if (!icons.has(key)) errors.push(`${where}: iconKey "${key}" is not in icon-keys.json`);
    },
    optionalIcon(where, key) {
      if (key !== undefined) this.needIcon(where, key);
    },
  };

  checkGames(games, ctx);
  checkQuestions(questions, ctx);
  return errors;
}