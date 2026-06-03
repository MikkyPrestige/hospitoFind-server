import express from "express";
import { verifyJWT, verifyAdmin } from "../middleware/verifyRoles.js";
import { osmImportLimiter } from "../middleware/rateLimiter.js";
import validate from "../middleware/validate.js";
import adminController from "../controllers/admin.js";
import * as symptomController from "../controllers/symptom.js";
import {
  createUserAdminSchema,
  updateUserRoleAdminSchema,
  importFromGoogleSchema,
  importFromOsmSchema,
  createHospitalAdminSchema,
  updateHospitalAdminSchema,
  batchApproveSchema,
  createSymptomMappingSchema,
  updateSymptomMappingSchema,
} from "../utils/validation.js";

const adminRouter = express.Router();

adminRouter.use(verifyJWT);
adminRouter.use(verifyAdmin);

// --- USER MANAGEMENT ---
adminRouter
  .route("/users")
  .get(adminController.getAllUsersAdmin)
  .post(validate(createUserAdminSchema), adminController.createUserAdmin);

adminRouter
  .route("/users/role")
  .patch(
    validate(updateUserRoleAdminSchema),
    adminController.updateUserRoleAdmin,
  );

adminRouter
  .route("/users/:id")
  .patch(adminController.toggleUserStatus)
  .delete(adminController.deleteUserAdmin);

// --- HOSPITAL MANAGEMENT ---
adminRouter
  .route("/hospitals/import-google")
  .post(validate(importFromGoogleSchema), adminController.importFromGoogle);

adminRouter
  .route("/hospitals/import-osm")
  .post(
    validate(importFromOsmSchema),
    osmImportLimiter,
    adminController.importFromOsm,
  );

adminRouter
  .route("/hospitals/pending")
  .get(adminController.getPendingHospitals);

adminRouter
  .route("/hospitals/check-duplicate")
  .get(adminController.checkDuplicateHospital);

adminRouter
  .route("/hospitals")
  .get(adminController.getAllHospitalsAdmin)
  .post(
    validate(createHospitalAdminSchema),
    adminController.createHospitalAdmin,
  );

adminRouter
  .route("/hospitals/approve-batch")
  .patch(validate(batchApproveSchema), adminController.batchApproveHospitals);

adminRouter
  .route("/hospitals/:id")
  .patch(
    validate(updateHospitalAdminSchema),
    adminController.updateHospitalAdmin,
  )
  .delete(adminController.deleteHospitalAdmin);

adminRouter
  .route("/hospitals/:id/toggle-status")
  .patch(adminController.toggleHospitalStatus);

adminRouter
  .route("/hospitals/approve/:id")
  .patch(
    validate(createHospitalAdminSchema),
    adminController.reviewAndApproveHospital,
  );

// --- SYMPTOM MAPPINGS ---
adminRouter
  .route("/symptoms")
  .get(symptomController.getSymptomMappings)
  .post(
    validate(createSymptomMappingSchema),
    symptomController.createSymptomMapping,
  );

adminRouter
  .route("/symptoms/:id")
  .put(
    validate(updateSymptomMappingSchema),
    symptomController.updateSymptomMapping,
  )
  .delete(symptomController.deleteSymptomMapping);

export default adminRouter;
