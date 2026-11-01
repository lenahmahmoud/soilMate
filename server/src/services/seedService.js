import Game from '../models/Game.js';
import Question from '../models/Question.js';

const META = new Set(['_id', '__v', 'createdAt', 'updatedAt']);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const body = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`);
    return `{${body.join(',')}}`;
  }
  return JSON.stringify(value);
}

const withoutMeta = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => !META.has(k)));

// Validates every document through its model and applies schema defaults, so the
// comparison with what is stored is exact. Writes nothing.
async function prepare(Model, docs, keyField) {
  const out = [];
  for (const doc of docs) {
    const instance = new Model(doc);
    try {
      await instance.validate();
    } catch (err) {
      throw new Error(`${Model.modelName} ${doc?.[keyField]}: ${err.message}`);
    }
    out.push(withoutMeta(instance.toObject({ versionKey: false })));
  }
  return out;
}

async function upsert(Model, docs, keyField, { select, labelOf }) {
  const counts = {};
  const bump = (label, outcome) => {
    counts[label] ??= { inserted: 0, updated: 0, unchanged: 0 };
    counts[label][outcome] += 1;
  };

  let query = Model.find({ [keyField]: { $in: docs.map((d) => d[keyField]) } });
  if (select) query = query.select(select);
  const existing = new Map((await query.lean()).map((d) => [d[keyField], d]));

  const toInsert = [];
  for (const doc of docs) {
    const label = labelOf(doc);
    const current = existing.get(doc[keyField]);

    if (!current) {
      toInsert.push(doc);
      bump(label, 'inserted');
      continue;
    }

    const stored = withoutMeta(current);
    if (stable(stored) === stable(doc)) {
      bump(label, 'unchanged');
      continue;
    }

    const update = { $set: doc };
    const removed = Object.keys(stored).filter((k) => !(k in doc));
    if (removed.length) update.$unset = Object.fromEntries(removed.map((k) => [k, '']));
    await Model.updateOne({ [keyField]: doc[keyField] }, update, { runValidators: true });
    bump(label, 'updated');
  }

  if (toInsert.length) await Model.insertMany(toInsert);
  return counts;
}

// Idempotent. Never deletes anything: retire a question with active: false in the data.
export async function seedDatabase({ games, questions }) {
  const preparedGames = await prepare(Game, games, 'slug');
  const preparedQuestions = await prepare(Question, questions, 'key');

  const gameCounts = await upsert(Game, preparedGames, 'slug', { labelOf: () => 'games' });
  const questionCounts = await upsert(Question, preparedQuestions, 'key', {
    select: '+correctChoiceKey +explanation',
    labelOf: (d) => d.gameSlug,
  });

  return {
    games: gameCounts.games ?? { inserted: 0, updated: 0, unchanged: 0 },
    questions: questionCounts,
  };
}