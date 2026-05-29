import { Router } from 'express';
import authRoutes from './authRoutes.js';
import queryRoutes from './queryRoutes.js';
import { ai } from '../config/ai.js';
import mongoose from 'mongoose';

const router = Router();

// Health/status — handy for Docker healthchecks and the CI smoke test.
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    ai: ai.mockMode ? 'mock' : 'live',
    time: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/queries', queryRoutes);

export default router;
