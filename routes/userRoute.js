import express from "express";
import userController from "../controllers/userController.js";
import { verifyJWT } from "../middleware/verifyRoles.js";

const userRouter = express.Router();

// userRouter.post("/", userController.createUser);

userRouter.use(verifyJWT);

userRouter
  .route("/")
  .get(userController.getAllUsers) // Only Admin
  .patch(userController.updateUser) // Owner or Admin
  .delete(userController.deleteUser); // Owner or Admin
userRouter.route("/role").patch(userController.updateUserRole); // Only Admin
userRouter.route("/stats").get(userController.getUserStats); // Owner or Admin
userRouter.route("/password").patch(userController.updatePassword); // Owner

export default userRouter;
