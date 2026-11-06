import { Router } from 'express';
import gamesRoutes from './gamesRoutes.js';
import attemptsRoutes from './attemptsRoutes.js';
import playersRoutes from './playersRoutes.js';
import authRoutes from './authRoutes.js';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/games', gamesRoutes);
router.use('/attempts', attemptsRoutes);
router.use('/players', playersRoutes);
router.use('/auth', authRoutes);

export default router;