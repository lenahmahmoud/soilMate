import { GAME_SLUGS } from '../constants/enums.js';

// games: all Game documents sorted by position. questions: [{ _id, collectionItem }].
// progress: only for the finale, { progressBySlug, summary }.
export function toCompleteResponse({ attempt, game, games, questions, progress }) {
  const { result } = attempt;
  const itemById = new Map(questions.map((q) => [String(q._id), q.collectionItem]));

  // Question order. A skipped or retried question is shown but not earned.
  const collection = [...attempt.questions]
    .sort((a, b) => a.position - b.position)
    .flatMap((aq) => {
      const item = itemById.get(String(aq.questionId));
      if (!item) return [];
      return [
        {
          key: item.key,
          label: item.label,
          iconKey: item.iconKey,
          earned: Boolean(aq.firstTryCorrect),
        },
      ];
    });

  const next = game.nextGameSlug ? games.find((g) => g.slug === game.nextGameSlug) : null;

  const out = {
    attemptId: String(attempt._id),
    gameSlug: attempt.gameSlug,
    score: result.score,
    total: result.total,
    stars: result.stars,
    points: attempt.points,
    bestStreak: attempt.bestStreak,
    badge: { name: game.badge.name, iconKey: game.badge.iconKey, earned: result.badgeEarned },
    collection,
  };

  if (game.recapChips?.length) {
    out.recap = game.recapChips.map(({ label, iconKey }) => ({ label, iconKey }));
  }
  out.nextGame = next ? { slug: next.slug, title: next.title } : null;

  if (game.isFinale && progress) {
    const { progressBySlug, summary } = progress;
    out.finale = {
      allGamesDone: summary.gamesDone === GAME_SLUGS.length,
      totalPoints: summary.totalPoints,
      gamesDone: summary.gamesDone,
      badges: games.map((g) => ({
        gameSlug: g.slug,
        name: g.badge.name,
        iconKey: g.badge.iconKey,
        earned: Boolean(progressBySlug.get(g.slug)?.badgeEarned),
      })),
      masterBadge: summary.masterBadge,
    };
  }
  return out;
}