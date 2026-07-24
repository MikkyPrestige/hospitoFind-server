import express from 'express';
import hospitalController from '../controllers/hospital.js';
import { verifyJWT } from '../middleware/verifyRoles.js';
import { ensureMongoUser } from '../middleware/ensureMongoUser.js';
import { hospitalSubmissionLimiter, publicApiLimiter } from '../middleware/rateLimiter.js';
import validate from '../middleware/validate.js';
import {
  addHospitalSchema,
  updateHospitalSchema,
  shareHospitalsSchema,
} from '../utils/validation.js';

const hospitalRouter = express.Router();

// --- PUBLIC READ-ONLY ROUTES ---
hospitalRouter.get('/', publicApiLimiter, hospitalController.getHospitals);
hospitalRouter.get('/count', hospitalController.getHospitalCount);
hospitalRouter.get('/random', hospitalController.getRandomHospitals);
hospitalRouter.get('/find', publicApiLimiter, hospitalController.findHospitals);
hospitalRouter.get('/nearby', publicApiLimiter, hospitalController.getNearbyHospitals);
hospitalRouter.get('/top', hospitalController.getTopHospitals);
hospitalRouter.get('/explore', publicApiLimiter, hospitalController.getHospitalsGroupedByCountry);
hospitalRouter.get(
  '/explore/top',
  publicApiLimiter,
  hospitalController.getHospitalsGroupedByCountryTop,
);
hospitalRouter.get(
  '/country/:country',
  publicApiLimiter,
  hospitalController.getHospitalsForCountry,
);
hospitalRouter.get('/:country/:city/:slug', hospitalController.getHospitalBySlug);
hospitalRouter.get('/stats/countries', hospitalController.getCountryStats);

hospitalRouter.post(
  '/share',
  publicApiLimiter,
  validate(shareHospitalsSchema),
  hospitalController.shareHospitals,
);
hospitalRouter.get('/share/:linkId', hospitalController.getSharedHospitals);
hospitalRouter.get('/export', publicApiLimiter, hospitalController.exportHospitals);

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
