import express from "express";
import { verifyJWT, verifyAdmin } from "../middleware/verifyRoles.js";
import adminController from "../controllers/adminController.js";

const adminRouter = express.Router();

adminRouter.use(verifyJWT);
adminRouter.use(verifyAdmin);

// --- USER MANAGEMENT ---
adminRouter
  .route("/users")
  .get(adminController.getAllUsersAdmin)
  .post(adminController.createUserAdmin);
adminRouter.route("/users/role").patch(adminController.updateUserRoleAdmin);
adminRouter
  .route("/users/:id")
  .patch(adminController.toggleUserStatus)
  .delete(adminController.deleteUserAdmin);

// --- HOSPITAL MANAGEMENT ---
adminRouter
  .route("/hospitals/import-google")
  .post(adminController.importFromGoogle);
adminRouter
  .route("/hospitals/pending")
  .get(adminController.getPendingHospitals);
adminRouter
  .route("/hospitals/check-duplicate")
  .get(adminController.checkDuplicateHospital);
adminRouter
  .route("/hospitals")
  .get(adminController.getAllHospitalsAdmin)
  .post(adminController.createHospitalAdmin);
adminRouter
  .route("/hospitals/:id")
  .patch(adminController.updateHospitalAdmin)
  .delete(adminController.deleteHospitalAdmin);
adminRouter
  .route("/hospitals/:id/toggle-status")
  .patch(adminController.toggleHospitalStatus);
adminRouter
  .route("/hospitals/approve/:id")
  .patch(adminController.reviewAndApproveHospital);

export default adminRouter;