import express from "express";
import asyncHandler from "express-async-handler";
import { getCoordinates } from "../config/geocode.js";

const router = express.Router();

/**
 * @desc Test geocoding for any address
 * @route GET /test/geocode?address=
 * @access Public
 */
router.get(
  "/geocode",
  asyncHandler(async (req, res) => {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({ message: "Please provide an address" });
    }

    const coords = await getCoordinates(address);

    if (coords.longitude && coords.latitude) {
      return res.status(200).json({
        success: true,
        address,
        coordinates: coords,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "Could not find coordinates for that address",
        coordinates: coords,
      });
    }
  })
);

export default router;
