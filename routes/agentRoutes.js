import express from "express";
import { chat, match } from "../controllers/agentController.js";
import { verifyJWT } from "../middleware/verifyRoles.js";

const router = express.Router();

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  return verifyJWT(req, res, next);
};

router.post("/chat", optionalAuth, chat);
router.post("/match", optionalAuth, match);

export default router;
