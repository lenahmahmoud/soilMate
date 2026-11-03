import { startAttempt, getCurrentAttempt } from '../services/attemptService.js';
import { answerQuestion, skipQuestion, abandonAttempt } from '../services/answerService.js';
import { completeAttempt } from '../services/completeService.js';

export async function start(req, res) {
  res.status(201).json(await startAttempt(req.params.slug, req.player.id));
}

export async function current(req, res) {
  res.json(await getCurrentAttempt(req.params.slug, req.player.id));
}

export async function answer(req, res) {
  const { questionId, choiceKey } = req.body;
  res.json(
    await answerQuestion({
      attemptId: req.params.attemptId,
      playerId: req.player.id,
      questionId,
      choiceKey,
    }),
  );
}

export async function skip(req, res) {
  res.json(
    await skipQuestion({
      attemptId: req.params.attemptId,
      playerId: req.player.id,
      questionId: req.body.questionId,
    }),
  );
}

export async function complete(req, res) {
  res.json(await completeAttempt({ attemptId: req.params.attemptId, playerId: req.player.id }));
}

export async function abandon(req, res) {
  res.json(await abandonAttempt({ attemptId: req.params.attemptId, playerId: req.player.id }));
}