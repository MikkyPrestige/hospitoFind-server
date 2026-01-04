import express from "express";
import loginLimiter from "../middleware/loginLimiter.js";
import authController from "../controllers/authController.js";

const authRouter = express.Router();

authRouter.route("/").post(loginLimiter, authController.login);
authRouter.route("/register").post(authController.register);
authRouter.route("/verify-email").get(authController.verifyEmail);
authRouter.route("/resend-verification").post(authController.resendVerification);
authRouter.route("/auth0").post(authController.auth0Login);
authRouter.route("/refresh").get(authController.refresh);
authRouter.route("/forgot-password").post(authController.forgotPassword);
authRouter
  .route("/reset-password/:resetToken")
  .put(authController.resetPassword);
authRouter.route("/logout").post(authController.logout);

export default authRouter;