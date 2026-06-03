import express from "express";
import loginLimiter from "../middleware/loginLimiter.js";
import authController from "../controllers/auth.js";
import validate from "../middleware/validate.js";
import {
  loginSchema,
  registerSchema,
  auth0LoginSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../utils/validation.js";

const authRouter = express.Router();

authRouter
  .route("/")
  .post(loginLimiter, validate(loginSchema), authController.login);

authRouter
  .route("/register")
  .post(validate(registerSchema), authController.register);

authRouter
  .route("/auth0")
  .post(validate(auth0LoginSchema), authController.auth0Login);

authRouter
  .route("/resend-verification")
  .post(validate(resendVerificationSchema), authController.resendVerification);

authRouter
  .route("/forgot-password")
  .post(validate(forgotPasswordSchema), authController.forgotPassword);

authRouter
  .route("/reset-password/:resetToken")
  .put(validate(resetPasswordSchema), authController.resetPassword);

authRouter.route("/refresh").get(authController.refresh);
authRouter.route("/verify-email").get(authController.verifyEmail);
authRouter.route("/logout").post(authController.logout);

export default authRouter;