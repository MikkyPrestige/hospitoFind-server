import express from "express";
import { chat, match } from "../controllers/agent.js";
import { verifyJWT } from "../middleware/verifyRoles.js";
import { ensureMongoUser } from "../middleware/ensureMongoUser.js";
import agentChatLimiter from "../middleware/agentChatLimiter.js";
import validate from "../middleware/validate.js";
import { chatSchema, matchSchema } from "../utils/validation.js";

const router = express.Router();

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .json({ message: "Forbidden: Invalid or Expired token" });
    }
    req.user = decoded.UserInfo.username;
    req.role = decoded.UserInfo.role;
    req.userId = decoded.UserInfo.id;
    req.email = decoded.UserInfo.email;
    req.auth0Id = decoded.UserInfo.auth0Id || null;
    ensureMongoUser(req, res, next);
  });
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