import express from 'express';
import { verifyJWT } from '../middleware/verifyRoles.js';
import { ensureMongoUser } from '../middleware/ensureMongoUser.js';
import {
  getHealthHistory,
  updateSessionFeedback,
  deleteSession,
  clearHealthHistory,
} from '../controllers/healthHistory.js';
import validate from '../middleware/validate.js';
import { updateSessionFeedbackSchema } from '../utils/validation.js';

const router = express.Router();

router.use(verifyJWT);
router.use(ensureMongoUser);

router.get('/', getHealthHistory);
router.patch('/:sessionId/feedback', validate(updateSessionFeedbackSchema), updateSessionFeedback);
router.delete('/:sessionId', deleteSession);
router.delete('/', clearHealthHistory);

export default router;
