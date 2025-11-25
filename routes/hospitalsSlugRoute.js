import express from "express";
import hospitalSlugController from "../controllers/hospitalSlugController.js";


const hospitalSlugRouter = express.Router();

hospitalSlugRouter.route("/:country/:city/:slug").get(hospitalSlugController.getHospitalBySlug);
export default hospitalSlugRouter;
