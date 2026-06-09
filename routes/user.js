import express from "express";
import userController from "../controllers/user.js";
import { verifyJWT, verifyAdmin } from "../middleware/verifyRoles.js";
import { ensureMongoUser } from "../middleware/ensureMongoUser.js";
import validate from "../middleware/validate.js";
import {
  updateUserProfileSchema,
  updatePasswordSchema,
  recordViewSchema,
  updateUserRoleSchema,
  deleteUserSchema,
} from "../utils/validation.js";

const userRouter = express.Router();

userRouter.use(verifyJWT);
userRouter.use(ensureMongoUser);

// admin-only
userRouter.route("/").get(verifyAdmin, userController.getAllUsers);
userRouter
  .route("/role")
  .patch(
    verifyAdmin,
    validate(updateUserRoleSchema),
    userController.updateUserRole,
  );

// authenticated user routes
userRouter
  .route("/")
  .patch(validate(updateUserProfileSchema), userController.updateUser)
  .delete(validate(deleteUserSchema), userController.deleteUser);

userRouter.route("/stats").get(userController.getUserStats);
userRouter
  .route("/password")
  .patch(validate(updatePasswordSchema), userController.updatePassword);
userRouter
  .route("/view")
  .post(validate(recordViewSchema), userController.recordView);
userRouter.route("/activity").get(userController.getUserActivity);
userRouter
  .route("/history/:hospitalId")
  .delete(userController.removeHistoryItem);
userRouter.route("/history").delete(userController.clearAllHistory);
userRouter
  .route("/favorites-status/:hospitalId")
  .post(userController.toggleFavoriteStatus);
userRouter
  .route("/favorites/:hospitalId")
  .delete(userController.removeFavorite);

export default userRouter;
