import express from "express";
import { chat, match } from "../controllers/agent.js";
import { verifyJWT } from "../middleware/verifyRoles.js";
import agentChatLimiter from "../middleware/agentChatLimiter.js";
import validate from "../middleware/validate.js";
import { chatSchema, matchSchema } from "../utils/validation.js";

const router = express.Router();

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }
  return verifyJWT(req, res, next);
};

router.post(
  "/chat",
  agentChatLimiter,
  optionalAuth,
  validate(chatSchema),
  chat,
);
router.post("/match", optionalAuth, validate(matchSchema), match);

export default router;