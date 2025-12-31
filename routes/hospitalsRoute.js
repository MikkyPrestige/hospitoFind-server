import express from "express";
import hospitalController from "../controllers/hospitalController.js";
import { verifyJWT, verifyAdmin } from "../middleware/verifyRoles.js";

const hospitalRouter = express.Router();

// --- PUBLIC READ-ONLY ROUTES ---
hospitalRouter.get("/", hospitalController.getHospitals);
hospitalRouter.get("/count", hospitalController.getHospitalCount);
hospitalRouter.get("/random", hospitalController.getRandomHospitals);
hospitalRouter.get("/find", hospitalController.findHospitals);
hospitalRouter.get("/search", hospitalController.searchHospitals);
hospitalRouter.get("/nearby", hospitalController.getNearbyHospitals);
hospitalRouter.get("/top", hospitalController.getTopHospitals);
hospitalRouter.get("/explore", hospitalController.getHospitalsGroupedByCountry);
hospitalRouter.get(
  "/explore/top",
  hospitalController.getHospitalsGroupedByCountryTop
);
hospitalRouter.get(
  "/country/:country",
  hospitalController.getHospitalsForCountry
);
hospitalRouter.get("/stats/countries", hospitalController.getCountryStats);

// Sharing & Exporting hospitals routes
hospitalRouter.post("/share", hospitalController.shareHospitals);
hospitalRouter.get("/share/:linkId", hospitalController.getSharedHospitals);
hospitalRouter.get("/export", hospitalController.exportHospitals);

// Specific lookups
hospitalRouter.get("/id/:id", hospitalController.getHospitalById);
hospitalRouter.get("/name/:name", hospitalController.getHospitalByName);

// --- COMMUNITY SANDBOX ROUTE ---
hospitalRouter.get("/sandbox", hospitalController.getUnverifiedHospitals);

// --- PROTECTED USER ACTIONS (Require JWT) ---
hospitalRouter.post("/", hospitalController.addHospital);
hospitalRouter.get(
  "/submissions",
  verifyJWT,
  hospitalController.getMySubmissions
);
hospitalRouter.patch("/:id", verifyJWT, hospitalController.updateHospital);

// --- RESTRICTED ADMIN ACTIONS (Require JWT + Admin Role) ---
hospitalRouter.get(
  "/admin/stats",
  verifyJWT,
  verifyAdmin,
  hospitalController.getAdminStats
);

hospitalRouter.get(
  "/admin/pending",
  verifyJWT,
  verifyAdmin,
  hospitalController.getPendingHospitals
);
hospitalRouter.patch(
  "/approve/:id",
  verifyJWT,
  verifyAdmin,
  hospitalController.approveHospital
);
hospitalRouter.delete(
  "/:id",
  verifyJWT,
  verifyAdmin,
  hospitalController.deleteHospital
);

export default hospitalRouter;
