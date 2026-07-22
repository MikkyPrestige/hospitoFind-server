import express from 'express';
import hospitalController from '../controllers/hospital.js';
import { verifyJWT } from '../middleware/verifyRoles.js';
import { ensureMongoUser } from '../middleware/ensureMongoUser.js';
import { hospitalSubmissionLimiter } from '../middleware/rateLimiter.js';
import validate from '../middleware/validate.js';
import {
  addHospitalSchema,
  updateHospitalSchema,
  shareHospitalsSchema,
} from '../utils/validation.js';

const hospitalRouter = express.Router();

// --- PUBLIC READ-ONLY ROUTES ---
hospitalRouter.get('/', hospitalController.getHospitals);
hospitalRouter.get('/count', hospitalController.getHospitalCount);
hospitalRouter.get('/random', hospitalController.getRandomHospitals);
hospitalRouter.get('/find', hospitalController.findHospitals);
hospitalRouter.get('/nearby', hospitalController.getNearbyHospitals);
hospitalRouter.get('/top', hospitalController.getTopHospitals);
hospitalRouter.get('/explore', hospitalController.getHospitalsGroupedByCountry);
hospitalRouter.get('/explore/top', hospitalController.getHospitalsGroupedByCountryTop);
hospitalRouter.get('/country/:country', hospitalController.getHospitalsForCountry);
hospitalRouter.get('/:country/:city/:slug', hospitalController.getHospitalBySlug);
hospitalRouter.get('/stats/countries', hospitalController.getCountryStats);

hospitalRouter.post('/share', validate(shareHospitalsSchema), hospitalController.shareHospitals);
hospitalRouter.get('/share/:linkId', hospitalController.getSharedHospitals);
hospitalRouter.get('/export', hospitalController.exportHospitals);

hospitalRouter.get('/id/:id', hospitalController.getHospitalById);
hospitalRouter.get('/name/:name', hospitalController.getHospitalByName);

hospitalRouter.get('/autocomplete', hospitalController.autocompleteHospitals);

// --- PROTECTED USER ACTIONS (Require JWT) ---
hospitalRouter.post(
  '/',
  verifyJWT,
  ensureMongoUser,
  hospitalSubmissionLimiter,
  validate(addHospitalSchema),
  hospitalController.addHospital,
);
hospitalRouter.get('/submissions', verifyJWT, ensureMongoUser, hospitalController.getMySubmissions);
hospitalRouter.patch(
  '/:id',
  verifyJWT,
  ensureMongoUser,
  validate(updateHospitalSchema),
  hospitalController.updateHospital,
);

export default hospitalRouter;
