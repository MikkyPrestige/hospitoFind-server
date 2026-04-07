import express from "express";
import userController from "../controllers/userController.js";
import { verifyJWT, verifyAdmin } from "../middleware/verifyRoles.js";

const userRouter = express.Router();

userRouter.use(verifyJWT);

// admin-only
userRouter.route("/").get(verifyAdmin, userController.getAllUsers);
userRouter.route("/role").patch(verifyAdmin, userController.updateUserRole);

// authenticated user routes
userRouter.route("/").patch(userController.updateUser).delete(userController.deleteUser);
userRouter.route("/stats").get(userController.getUserStats);
userRouter.route("/password").patch(userController.updatePassword);
userRouter.route("/view").post(userController.recordView);
userRouter.route("/activity").get(userController.getUserActivity);
userRouter.route("/history/:hospitalId").delete(userController.removeHistoryItem);
userRouter.route("/history").delete(userController.clearAllHistory);
userRouter.route("/favorites-status/:hospitalId").post(userController.toggleFavoriteStatus);
userRouter.route("/favorites/:hospitalId").delete(userController.removeFavorite);

export default userRouter;
