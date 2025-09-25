import express from "express";
import userController from "../controllers/userController.js";

const userRouter = express.Router();


userRouter.route("/")
  .get(userController.getUsers)
  .post(userController.createUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser)

userRouter.route("/password")
  .patch(userController.updatePassword)

export default userRouter;
