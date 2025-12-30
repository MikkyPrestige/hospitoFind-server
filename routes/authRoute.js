import express from "express";
import loginLimiter from "../middleware/loginLimiter.js";
import authController from "../controllers/authController.js";

const authRouter = express.Router();

// Standard Login (with rate limiting)
authRouter.route("/").post(loginLimiter, authController.login);
authRouter.route("/register").post(authController.register);
// Auth0 / Social Login
authRouter.route("/auth0").post(authController.auth0Login);
// Token Refresh (Silent Re-auth)
authRouter.route("/refresh").get(authController.refresh);
authRouter.route("/logout").post(authController.logout);

export default authRouter;