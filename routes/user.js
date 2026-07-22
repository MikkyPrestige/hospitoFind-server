import express from 'express';
import userController from '../controllers/user.js';
import { verifyJWT, verifyAdmin } from '../middleware/verifyRoles.js';
import { ensureMongoUser } from '../middleware/ensureMongoUser.js';
import validate from '../middleware/validate.js';
import {
  updateUserProfileSchema,
  updatePasswordSchema,
  recordViewSchema,
  updateUserRoleSchema,
  deleteUserSchema,
  totpSetupVerifySchema,
  totpDisableSchema,
  totpRecoveryCodesSchema,
} from '../utils/validation.js';

const userRouter = express.Router();

userRouter.use(verifyJWT);
userRouter.use(ensureMongoUser);

// admin-only
userRouter
  .route('/role')
  .patch(verifyAdmin, validate(updateUserRoleSchema), userController.updateUserRole);

// authenticated user routes
userRouter
  .route('/')
  .patch(validate(updateUserProfileSchema), userController.updateUser)
  .delete(validate(deleteUserSchema), userController.deleteUser);
userRouter.route('/password').patch(validate(updatePasswordSchema), userController.updatePassword);

// user stats and activity
userRouter.route('/stats').get(userController.getUserStats);
userRouter.route('/view').post(validate(recordViewSchema), userController.recordView);
userRouter.route('/activity').get(userController.getUserActivity);

// TOTP management
userRouter.route('/totp/setup').post(userController.setupTotp);
userRouter
  .route('/totp/verify')
  .post(validate(totpSetupVerifySchema), userController.verifyTotpSetup);
userRouter.route('/totp/disable').post(validate(totpDisableSchema), userController.disableTotp);
userRouter
  .route('/totp/recovery-codes')
  .post(validate(totpRecoveryCodesSchema), userController.regenerateRecoveryCodes);

// favorites and history
userRouter.route('/history/:hospitalId').delete(userController.removeHistoryItem);
userRouter.route('/history').delete(userController.clearAllHistory);
userRouter.route('/favorites-status/:hospitalId').post(userController.toggleFavoriteStatus);
userRouter.route('/favorites/:hospitalId').delete(userController.removeFavorite);

export default userRouter;
