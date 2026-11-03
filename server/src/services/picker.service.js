import Game from '../models/Game.js';
import Question from '../models/Question.js';
import QuestionHistory from '../models/QuestionHistory.js';
import { AppError } from '../utils/AppError.js';
import { shuffle, pickRandom } from '../utils/random.js';

const GAME2_GROUPS = ['satellite', 'both', 'ground'];

const toChoice = ({ key, label, iconKey }) => ({ key, label, iconKey });

function notEnough(gameSlug) {
  return new AppError(500, 'INTERNAL', `Not enough active questions for ${gameSlug}`);
}

// 6.2 Ranking: never seen, then lowest timesSeen, then oldest lastSeenAt, then random.
export function rankQuestions(questions, historyRows) {
  const byId = new Map(historyRows.map((h) => [String(h.questionId), h]));
  const rows = questions.map((question) => {
    const h = byId.get(String(question._id));
    return {
      question,
      seen: h ? h.timesSeen : -1,
      last: h && h.lastSeenAt ? new Date(h.lastSeenAt).getTime() : 0,
    };
  });
  // Shuffle first, then a stable sort: remaining ties stay in random order.
  return shuffle(rows)
    .sort((a, b) => a.seen - b.seen || a.last - b.last)
    .map((row) => row.question);
}

function selectQuestions(gameSlug, ranked, count) {
  switch (gameSlug) {
    case 'match-the-word':
    case 'fix-the-field':
    case 'weather-and-crops': {
      if (ranked.length < count) throw notEnough(gameSlug);
      return ranked.slice(0, count);
    }
    case 'satellite-or-ground': {
      const perGroup = count / GAME2_GROUPS.length;
      const selected = [];
      for (const group of GAME2_GROUPS) {
        const inGroup = ranked.filter((q) => q.group === group).slice(0, perGroup);
        if (inGroup.length < perGroup) throw notEnough(gameSlug);
        selected.push(...inGroup);
      }
      return selected;
    }
    case 'crop-superpowers': {
      const groups = [...new Set(ranked.map((q) => q.group))];
      if (groups.length < count) throw notEnough(gameSlug);
      return pickRandom(groups, count).map((group) => ranked.find((q) => q.group === group));
    }
    default:
      throw new AppError(404, 'NOT_FOUND', 'Game not found');
  }
}

function buildChoices(gameSlug, question, allQuestions) {
  if (gameSlug === 'match-the-word') {
    const correct = toChoice(question.choices[0]);
    const others = allQuestions
      .filter((q) => q.key !== question.key)
      .map((q) => toChoice(q.choices[0]))
      .filter((c) => c.label !== correct.label);
    if (others.length < 2) throw notEnough(gameSlug);
    return shuffle([correct, ...pickRandom(others, 2)]);
  }
  if (gameSlug === 'satellite-or-ground') {
    // Fixed order, never shuffled.
    return GAME2_GROUPS.map((key) => {
      const choice = question.choices.find((c) => c.key === key);
      if (!choice) throw new AppError(500, 'INTERNAL', `Question ${question.key} is missing choice ${key}`);
      return toChoice(choice);
    });
  }
  return shuffle(question.choices.map(toChoice));
}

// Pure part of the picker (no database): easy to test.
export function pickFromPool({ gameSlug, questions, history, count }) {
  const ranked = rankQuestions(questions, history);
  const selected = selectQuestions(gameSlug, ranked, count);
  return shuffle(selected).map((question, index) => ({
    question,
    position: index + 1,
    choices: buildChoices(gameSlug, question, questions),
  }));
}

// 6.3 Runs when an attempt starts. Does NOT update QuestionHistory.
// Returns [{ question, position, choices }]. startAttempt stores questionId, position and choices.
export async function pickQuestions(gameSlug, playerId) {
  const game = await Game.findOne({ slug: gameSlug }).lean();
  if (!game) throw new AppError(404, 'NOT_FOUND', 'Game not found');

  const [questions, history] = await Promise.all([
    Question.find({ gameSlug, active: true }).lean(),
    QuestionHistory.find({ playerId, gameSlug }).lean(),
  ]);

  return pickFromPool({ gameSlug, questions, history, count: game.questionsPerRound });
}