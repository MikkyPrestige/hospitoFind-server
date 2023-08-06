import express from "express";
import userController from "../controllers/userController.js";

const userRouter = express.Router();


userRouter.route("/")
  .get(userController.getUsers)
  .post(userController.createUser)

export default userRouter;