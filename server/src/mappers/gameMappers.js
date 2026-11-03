import { GAME_SLUGS } from '../constants/enums.js';
import { MASTER_BADGE } from '../constants/badges.js';

// A Progress row exists only after an attempt was completed.
const toBest = (progress) => ({
  score: progress ? progress.bestScore : null,
  stars: progress ? progress.bestStars : null,
  points: progress ? progress.bestPoints : null,
  badgeEarned: progress ? progress.badgeEarned : false,
  completed: Boolean(progress),
  timesPlayed: progress ? progress.timesPlayed : 0,
});

export function toGameSummary(game, progress, seen) {
  return {
    slug: game.slug,
    title: game.title,
    position: game.position,
    questionsPerRound: game.questionsPerRound,
    poolSize: game.poolSize,
    questionsSeen: Math.min(seen, game.poolSize),
    mascotOutfit: game.mascotOutfit,
    badge: { name: game.badge.name, iconKey: game.badge.iconKey },
    best: toBest(progress),
  };
}

export function toProgress(progressBySlug, seenBySlug) {
  const games = GAME_SLUGS.map((slug) => {
    const progress = progressBySlug.get(slug);
    return {
      slug,
      completed: Boolean(progress),
      bestScore: progress ? progress.bestScore : null,
      bestStars: progress ? progress.bestStars : null,
      bestPoints: progress ? progress.bestPoints : null,
      badgeEarned: progress ? progress.badgeEarned : false,
      questionsSeen: seenBySlug.get(slug) ?? 0,
    };
  });

  return {
    totalPoints: games.reduce((sum, g) => sum + (g.bestPoints ?? 0), 0),
    gamesDone: games.filter((g) => g.completed).length,
    games,
    masterBadge: { ...MASTER_BADGE, earned: games.every((g) => g.badgeEarned) },
  };
}