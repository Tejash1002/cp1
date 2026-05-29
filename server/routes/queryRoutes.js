import { Router } from 'express';
import * as ctrl from '../controllers/queryController.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { banCheck } from '../middleware/banCheck.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { screenshotUpload } from '../middleware/upload.js';

const router = Router();

// Public reads (optionalAuth so the viewer's ownership can be reflected).
router.get('/', optionalAuth, ctrl.list);

// Opt-in grammar check (AI-backed, rate-limited).
router.post('/check-grammar', auth, aiLimiter, ctrl.checkGrammar);

router.get('/:id', optionalAuth, ctrl.detail);

// Writes require a logged-in, non-banned user.
router.post('/', auth, banCheck, aiLimiter, screenshotUpload, ctrl.create);
router.patch('/:id', auth, banCheck, ctrl.update);
router.delete('/:id', auth, ctrl.remove);

export default router;
