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

// import express from "express";
// import { verifyJWT, verifyAdmin } from "../middleware/verifyRoles.js";
// import {
//   getAllUsersAdmin,
//   createUserAdmin,
//   updateUserRoleAdmin,
//   toggleUserStatus,
//   getAllHospitalsAdmin,
//   createHospitalAdmin,
//   updateHospitalAdmin,
//   toggleHospitalStatus,
//   reviewAndApproveHospital,
//   checkDuplicateHospital,
//   deleteHospitalAdmin,
//   deleteUserAdmin,
// } from "../controllers/adminController.js";

// const router = express.Router();

// // Apply protection to ALL routes here
// router.use(verifyJWT);
// router.use(verifyAdmin);

// // User Management Routes
// router.get("/users", getAllUsersAdmin);
// router.post("/users", createUserAdmin);
// router.patch("/users/role", updateUserRoleAdmin);
// router.patch("/users/status/:id", toggleUserStatus);
// // Hospital Management Routes
// router.get("/hospitals", getAllHospitalsAdmin);
// router.get("/hospitals/check-duplicate", checkDuplicateHospital);
// router.post("/hospitals", createHospitalAdmin);
// router.post("/hospitals/check-duplicate", checkDuplicateHospital);
// router.patch("/hospitals/:id", updateHospitalAdmin);
// router.patch("/hospitals/:id/toggle-status", toggleHospitalStatus);
// router.patch("/hospitals/review-approve/:id", reviewAndApproveHospital);
// router.delete("/hospitals/:id", deleteHospitalAdmin);
// router.delete("/users/:id", deleteUserAdmin);

// export default router;
