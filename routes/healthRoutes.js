import express from "express";
import healthController from "../controllers/healthController.js";

const healthRouter = express.Router();

healthRouter.route("/news").get(healthController.getGlobalHealthNews);
healthRouter.route("/alerts").get(healthController.getHealthAlerts);
healthRouter.route("/tips").get(healthController.getHealthTips);

export default healthRouter;
