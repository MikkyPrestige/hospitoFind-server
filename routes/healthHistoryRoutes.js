import express from "express";
import { verifyJWT } from "../middleware/verifyRoles.js";
import {
  getHealthHistory,
  updateSessionFeedback,
  deleteSession,
  clearHealthHistory,
} from "../controllers/healthHistoryController.js";

const router = express.Router();

router.use(verifyJWT);

router.get("/", getHealthHistory);
router.patch("/:sessionId/feedback", updateSessionFeedback);
router.delete("/:sessionId", deleteSession);
router.delete("/", clearHealthHistory);

export default router;
