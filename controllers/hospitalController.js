import asyncHandler from "express-async-handler";
import ids from "short-id";
import papa from "papaparse";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Hospital from "../models/hospitalsModel.js";
import ShareableLink from "../models/shareModel.js";
import { getCoordinates } from "../config/geocode.js";
import { normalizeCountry } from "../config/locationHelper.js";
import User from "../models/userModel.js";

dotenv.config();

// In-memory cache for nearby hospitals
const nearbyCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// getDistance formula to calculate distance between two lat/lon points
const getDistance = (a, b) => {
  const R = 6371e3; // meters
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const d =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d));
};

// @desc Get all hospitals (Verified Only)
// @route GET /hospitals
// @access Public
const getHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find({ verified: true }).lean();
  if (!hospitals || hospitals.length === 0) {
    return res.status(404).json({ message: "No verified hospitals found" });
  }
  return res.json(hospitals);
});

// @desc Get hospitals submitted by the authenticated user
// @route GET /hospitals/mine
// @access Private (Registered User)
const getMySubmissions = asyncHandler(async (req, res) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized: No User ID" });
  }
  const userObjectId = new mongoose.Types.ObjectId(req.userId);
  const myHospitals = await Hospital.find({
    $or: [{ createdBy: userObjectId }, { createdBy: req.userId }],
  }).sort({ createdAt: -1 });

  res.status(200).json(myHospitals);
});

// @desc Get total hospital count (Verified Only)
const getHospitalCount = asyncHandler(async (req, res) => {
  const count = await Hospital.countDocuments({ verified: true });
  res.json({ total: count });
});

// @desc Get hospital counts grouped by country (Verified Only)
// @route GET /hospitals/stats/countries
// @access Public
const getCountryStats = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find(
    { verified: true },
    { "address.state": 1 }
  ).lean();

  const stats = {};

  hospitals.forEach((h) => {
    const country = normalizeCountry(h.address?.state);
    stats[country] = (stats[country] || 0) + 1;
  });

  const result = Object.entries(stats)
    .map(([country, count]) => ({
      country,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  res.json(result);
});

// @desc Get hospitals randomly
// @route GET /hospitals/random
// @access Public
const getRandomHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.aggregate([
    { $match: { verified: true } },
    { $sample: { size: 8 } },
  ]);

  if (!hospitals || hospitals.length === 0) {
    return res.status(400).json({ message: "No Hospital found" });
  }
  return res.json(hospitals);
});

// @desc Get unverified hospitals for community contribution
// @route GET /hospitals/sandbox
// @access Public
const getUnverifiedHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find({ verified: false }).lean();

  if (!hospitals || hospitals.length === 0) {
    return res.status(200).json([]);
  }

  return res.json(hospitals);
});

// @desc Admin-only fetch for pending approvals
// @route GET /hospitals/admin/pending
// @access Private (Admin)
const getPendingHospitals = asyncHandler(async (req, res) => {
  const pending = await Hospital.find({ verified: false })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(pending);
});

// @desc Approve a hospital (Toggle verified to true)
// @route PATCH /hospitals/:id/approve
// @access Private (Admin)
const approveHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hospital = await Hospital.findById(id);
  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }

  hospital.verified = true;
  await hospital.save();

  return res.json({
    message: `${hospital.name} is now verified and live!`,
    hospital,
  });
});

// @desc Get hospital by name (Verified Only)
// @route GET /hospitals/:name
// @access Public
const getHospitalByName = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const hospital = await Hospital.findOne({ name, verified: true }).lean();
  if (!hospital) {
    return res
      .status(404)
      .json({ message: "Hospital not found or pending review" });
  }
  return res.json(hospital);
});

// Helper: Escape regex characters to prevent crashing on symbols like "(" or "+"
function escapeRegex(text = "") {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// @desc Find hospitals by smart search (Name, City, State/Country)
// @route GET /hospitals/find?term=... OR ?city=...&state=...
// @access Public
const findHospitals = asyncHandler(async (req, res) => {
  let { term, city, state } = req.query;

  // SCENARIO 1: Dropdown Click (Precision Search)
  if (city && state) {
    const query = {
      verified: true,
      // Match exactly (case-insensitive)
      "address.city": {
        $regex: new RegExp(`^${escapeRegex(city.trim())}$`, "i"),
      },
      "address.state": {
        $regex: new RegExp(`^${escapeRegex(state.trim())}$`, "i"),
      },
    };

    const hospitals = await Hospital.find(query).lean().limit(100);
    return res.status(200).json(hospitals || []);
  }

  // SCENARIO 2: Manual Typing (Smart Text Search)
  if (!term || typeof term !== "string" || term.trim().length < 2) {
    return res
      .status(400)
      .json({ message: "Please enter at least 2 characters" });
  }

  const cleanTerm = term.trim();
  const safe = escapeRegex(cleanTerm);

  // Base OR Conditions: Search Name, Street, City, or Country (State field)
  const orConditions = [
    { name: { $regex: new RegExp(safe, "i") } },
    { "address.street": { $regex: new RegExp(safe, "i") } },
    { "address.city": { $regex: new RegExp(safe, "i") } },
    { "address.state": { $regex: new RegExp(safe, "i") } },
  ];

  // Smart Logic: Handle "City Country"
  // 1. Try treating the whole term as just a City
  orConditions.push({ "address.city": { $regex: new RegExp(safe, "i") } });

  // 2. Try splitting by the LAST space to separate City from Country
  const lastSpaceIndex = cleanTerm.lastIndexOf(" ");
  if (lastSpaceIndex !== -1) {
    const cityPart = cleanTerm.substring(0, lastSpaceIndex).trim();
    const countryPart = cleanTerm.substring(lastSpaceIndex + 1).trim();

    if (cityPart.length > 1 && countryPart.length > 1) {
      orConditions.push({
        $and: [
          {
            "address.city": { $regex: new RegExp(escapeRegex(cityPart), "i") },
          },
          {
            "address.state": {
              $regex: new RegExp(escapeRegex(countryPart), "i"),
            },
          },
        ],
      });
    }
  }

  const query = { verified: true, $or: orConditions };

  // Fetch results (lean for speed)
  let hospitals = await Hospital.find(query).lean().limit(100);

  // --- SMART RANKING ---
  // Sort results in memory to give the user the "Best Match" first
  const lowerTerm = cleanTerm.toLowerCase();

  hospitals.sort((a, b) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();

    // Priority 1: Exact Name Match
    if (nameA === lowerTerm) return -1;
    if (nameB === lowerTerm) return 1;

    // Priority 2: Name Starts With Term
    if (nameA.startsWith(lowerTerm) && !nameB.startsWith(lowerTerm)) return -1;
    if (!nameA.startsWith(lowerTerm) && nameB.startsWith(lowerTerm)) return 1;

    // Priority 3: Name Contains Term
    const hasNameA = nameA.includes(lowerTerm);
    const hasNameB = nameB.includes(lowerTerm);
    if (hasNameA && !hasNameB) return -1;
    if (!hasNameA && hasNameB) return 1;

    return 0; // Keep original order
  });

  return res.status(200).json(hospitals || []);
});

// @desc Get nearby hospitals based on lat/lon or IP
// @route GET /hospitals/nearby?lat=..&lon=..&limit=..
// @access Public
const getNearbyHospitals = async (req, res) => {
  const { lat, lon, limit } = req.query;
  const max = parseInt(limit) || 3;
  const maxRadiusMeters = 500000; // 500km

  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);
  const hasLocation = !isNaN(userLat) && !isNaN(userLon);

  // Check Cache
  const cacheKey = hasLocation
    ? `geo:${userLat}:${userLon}:${max}`
    : `ip:${req.ip}`;
  const cached = nearbyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    let results = [];
    let fallback = false;
    let message = "Showing verified hospitals near you.";

    // ATTEMPT SMART SEARCH (If coords exist)
    if (hasLocation) {
      try {
        // Attempt MongoDB Geospatial Query
        results = await Hospital.find({
          verified: true,
          location: {
            $near: {
              $geometry: { type: "Point", coordinates: [userLon, userLat] },
              $maxDistance: maxRadiusMeters,
            },
          },
        })
          .limit(max)
          .lean();
      } catch (geoError) {
        console.warn(
          "⚠️ MongoDB Index Error (Using Manual Fallback):",
          geoError.message
        );
        // If Index fails, fetch ALL verified and filter manually
        const allHospitals = await Hospital.find({ verified: true }).lean();
        results = allHospitals
          .map((h) => {
            // Use legacy lat/lon if location missing
            const hLat = h.location?.coordinates?.[1] ?? h.latitude;
            const hLon = h.location?.coordinates?.[0] ?? h.longitude;
            if (!hLat || !hLon) return { ...h, distanceValue: Infinity };

            const dist = getDistance(
              { lat: userLat, lon: userLon },
              { lat: hLat, lon: hLon }
            );
            return { ...h, distanceValue: dist };
          })
          .filter((h) => h.distanceValue <= maxRadiusMeters)
          .sort((a, b) => a.distanceValue - b.distanceValue)
          .slice(0, max);
      }
    }

    // FALLBACK (If no coords OR no results found)
    if (!results.length) {
      fallback = true;
      message = hasLocation
        ? "No hospitals found nearby. Showing top verified hospitals."
        : "Showing verified global hospitals.";

      console.log("[GeoSearch] No results found nearby. Fetching random...");
      results = await Hospital.aggregate([
        { $match: { verified: true } },
        { $sample: { size: max } },
      ]);
    }

    // DISTANCE CALCULATION (Formatting)
    if (hasLocation) {
      results = results.map((h) => {
        const hLon = h.location?.coordinates?.[0] ?? h.longitude;
        const hLat = h.location?.coordinates?.[1] ?? h.latitude;

        if (hLat !== undefined && hLon !== undefined) {
          const dist = getDistance(
            { lat: userLat, lon: userLon },
            { lat: hLat, lon: hLon }
          );
          // Add formatted distance string
          return {
            ...h,
            distance: `${(dist / 1000).toFixed(1)} km`,
          };
        }
        return h;
      });
    }

    const responseData = { results, fallback, message };

    // Save to Cache
    nearbyCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return res.json(responseData);
  } catch (err) {
    console.error("Critical Search Error:", err);
    return res.status(500).json({ message: "Search service unavailable" });
  }
};

// @desc Get hospital by ID (Verified Only)
// @route GET /hospitals/:id
// @access Public
const getHospitalById = async (req, res) => {
  const { id } = req.params;
  try {
    const hospital = await Hospital.findOne({ _id: id, verified: true }).lean();
    if (hospital) {
      const { street, city, state } = hospital.address || {};
      const locationString = [street, city, state].filter(Boolean).join(", ");
      return res.json({
        ...hospital,
        location: locationString || "Location unavailable",
      });
    }
    res.status(404).json({ message: "Hospital not found or pending review" });
  } catch (err) {
    res.status(500).json({ message: "Server error fetching hospital" });
  }
};

// @desc Get top featured hospitals (Verified Only)
let cachedFeatured = [];
let lastFeaturedFetch = 0;
const FEATURED_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

const getTopHospitals = async (req, res) => {
  const now = Date.now();
  if (cachedFeatured.length && now - lastFeaturedFetch < FEATURED_CACHE_TTL) {
    return res.json(cachedFeatured.sort(() => 0.5 - Math.random()).slice(0, 3));
  }

  try {
    const hospitals = await Hospital.find({ isFeatured: true, verified: true })
      .limit(20)
      .lean();

    cachedFeatured = hospitals.length
      ? hospitals
      : await Hospital.aggregate([
          { $match: { verified: true } },
          { $sample: { size: 20 } },
        ]);

    lastFeaturedFetch = now;
    res.json(cachedFeatured.sort(() => 0.5 - Math.random()).slice(0, 3));
  } catch (err) {
    return res.status(500).json({ message: "Failed to load top hospitals" });
  }
};

// GET /hospitals/explore/top
const getHospitalsGroupedByCountryTop = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find({ verified: true }).lean();

  const grouped = {};

  hospitals.forEach((h) => {
    const country = normalizeCountry(h.address?.state);

    if (!grouped[country]) grouped[country] = [];
    grouped[country].push({
      ...h,
      address: { ...h.address, country },
    });
  });

  const result = Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b))
    .map((country) => ({
      country,
      hospitals: grouped[country],
    }));

  res.json(result);
});

// GET /hospitals/explore
const getHospitalsGroupedByCountry = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find({ verified: true }).lean();

  const grouped = {};

  hospitals.forEach((h) => {
    const country = normalizeCountry(h.address?.state);

    if (!grouped[country]) grouped[country] = [];
    grouped[country].push({
      ...h,
      address: { ...h.address, country },
    });
  });

  const result = Object.keys(grouped)
    .sort((a, b) => {
      // Sort by the number of hospitals (highest first)
      const diff = grouped[b].length - grouped[a].length;
      return diff !== 0 ? diff : a.localeCompare(b);
    })
    .map((country) => ({
      country,
      hospitals: grouped[country],
    }));

  res.json(result);
});

// GET /hospitals/country/:country
const getHospitalsForCountry = asyncHandler(async (req, res) => {
  const rawParam = (req.params.country || "").trim();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const skip = (page - 1) * limit;

  const countryParam = rawParam.toLowerCase();
  const orConditions = [];

  if (countryParam === "nigeria") {
    nigeriaStates.forEach((s) =>
      orConditions.push({
        "address.state": { $regex: new RegExp(`^${s}$`, "i") },
      })
    );
    orConditions.push({ "address.state": { $regex: /nigeria/i } });
  } else {
    orConditions.push({
      "address.state": { $regex: new RegExp(`^${rawParam}$`, "i") },
    });
  }

  const query = {
    verified: true,
    $or: orConditions,
  };

  const total = await Hospital.countDocuments(query);
  const hospitals = await Hospital.find(query).skip(skip).limit(limit).lean();

  const formatted = hospitals.map((doc) => {
    const country = normalizeCountry(doc.address?.state);
    return {
      ...doc,
      address: { ...doc.address, country },
    };
  });

  res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hospitals: formatted,
  });
});

// @desc share hospitals by generating a shareable link (Verified Only)
// @route POST /hospitals/share
// @access Public
const shareHospitals = asyncHandler(async (req, res) => {
  const { address, city, state } = req.body?.searchParams || {};

  const query = { verified: true };

  if (address) {
    query["$or"] = [
      { name: { $regex: new RegExp(address, "i") } },
      { "address.street": { $regex: new RegExp(address, "i") } },
    ];
  }
  if (city) query["address.city"] = { $regex: new RegExp(city, "i") };
  if (state) query["address.state"] = { $regex: new RegExp(state, "i") };

  const searchedHospitals = await Hospital.find(query).lean();

  if (!searchedHospitals || searchedHospitals.length === 0) {
    return res
      .status(404)
      .json({ message: "No verified hospitals found to share." });
  }

  // Generate unique ID for the shareable link
  const linkId = ids.generate();

  // Create and save the shareable link document
  const shareableLink = new ShareableLink({
    linkId,
    createdBy: req.userId ? req.userId : null,
    hospitals: searchedHospitals.map((hospital) => ({
      hospitalId: hospital._id,
      name: hospital.name,
      slug: hospital.slug,
      address: {
        street: hospital.address.street,
        city: hospital.address.city,
        state: hospital.address.state,
      },
      phone: hospital.phoneNumber,
      website: hospital.website,
      photoUrl: hospital.photoUrl,
      services: hospital.services,
      verified: hospital.verified,
    })),
  });

  await shareableLink.save();

  return res.status(201).json({
    message: "Shareable link created",
    linkId: linkId,
  });
});

// @desc Retrieve the hospital list associated with a shareable link
// @route GET /hospitals/share/:linkId
// @access Public
const getSharedHospitals = asyncHandler(async (req, res) => {
  const { linkId } = req.params;

  // Find the shareable link document by linkId
  const link = await ShareableLink.findOne({ linkId }).lean();

  if (!link) {
    return res
      .status(404)
      .json({ message: "This share link has expired or does not exist." });
  }

  return res.status(200).json(link.hospitals);
});

// @dec export hospitals to CSV (Verified Only)
// @route GET /hospitals/export
// @access Public
const exportHospitals = asyncHandler(async (req, res) => {
  const { address, city, state } = req.query;

  const query = { verified: true };

  if (address) {
    query["$or"] = [
      { name: { $regex: new RegExp(address, "i") } },
      { "address.street": { $regex: new RegExp(address, "i") } },
    ];
  }
  if (city) query["address.city"] = { $regex: new RegExp(city, "i") };
  if (state) query["address.state"] = { $regex: new RegExp(state, "i") };

  const hospitals = await Hospital.find(query).lean();

  if (!hospitals || hospitals.length === 0) {
    return res
      .status(404)
      .json({ message: "No verified records found to export." });
  }
  // Map hospital data to CSV format
  const csvData = hospitals.map((hospital) => ({
    name: hospital.name || "",
    street: hospital.address?.street || "",
    city: hospital.address?.city || "",
    country: normalizeCountry(hospital.address?.state),
    phone: hospital.phoneNumber || "",
    website: hospital.website || "",
    email: hospital.email || "",
    type: hospital.type || "",
    services: Array.isArray(hospital.services)
      ? hospital.services.join(", ")
      : "",
    comments: Array.isArray(hospital.comments)
      ? hospital.comments.join(", ")
      : "",
    hours: Array.isArray(hospital.hours)
      ? hospital.hours
          .map((hour) => `${hour.day || ""}: ${hour.open || ""}`)
          .join(" | ")
          .trim()
      : "",
  }));

  // Convert to CSV string using papa parse library
  const csv = papa.unparse(csvData, { header: true });

  // Set response headers for file download
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="verified_hospitals_export.csv"'
  );

  return res.status(200).send(csv);
});

// @desc add new hospital
// @route POST /hospitals
// @access Private (Registered User)
const addHospital = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    phoneNumber,
    website,
    email,
    photoUrl,
    type,
    services,
    comments,
    hours,
  } = req.body;

  // Basic Validation
  if (!name || !address?.city || !address?.state) {
    return res
      .status(400)
      .json({ message: "Name, City, and Country (State) are required" });
  }

  const duplicate = await Hospital.findOne({
    name,
    "address.city": address.city,
    "address.state": address.state,
  })
    .lean()
    .exec();

  if (duplicate) {
    return res
      .status(400)
      .json({ message: "This hospital already exists in our records" });
  }

  // Get coordinates
  const fullAddress = `${address.street || ""}, ${address.city}, ${
    address.state
  }`.trim();
  const { longitude, latitude } = await getCoordinates(fullAddress);

  if (!req.userId) {
    return res
      .status(401)
      .json({ message: "User identity not found. Please log in again." });
  }

  const hospital = new Hospital({
    name,
    address,
    phoneNumber,
    website,
    email,
    photoUrl,
    type,
    services,
    comments,
    hours,
    longitude,
    latitude,
    verified: false,
    isFeatured: false,
    createdBy: new mongoose.Types.ObjectId(req.userId),
  });

  const savedHospital = await hospital.save();

  return res.status(201).json({
    message: "Hospital submitted successfully and is pending review.",
    hospital: savedHospital,
  });
});

// @desc update hospital
// @route PATCH /hospitals/:id
// @access Public
const updateHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id)
    return res.status(400).json({ message: "Hospital ID is required in URL" });

  const hospital = await Hospital.findById(id);
  if (!hospital) return res.status(404).json({ message: "Hospital not found" });

  // If a non-admin edits a verified hospital, unverify it
  if (hospital.verified && req.role !== "admin") {
    hospital.verified = false;
  }

  Object.assign(hospital, updateData);

  // Re-check coordinates if address changed
  if (updateData.address) {
    const fullAddress = `${updateData.address.street || ""}, ${
      updateData.address.city
    }, ${updateData.address.state}`.trim();
    const { longitude, latitude } = await getCoordinates(fullAddress);

    if (longitude && latitude) {
      hospital.longitude = longitude;
      hospital.latitude = latitude;
    }
  }

  const updatedHospital = await hospital.save();
  return res.json({
    message: hospital.verified
      ? "Update saved."
      : "Update saved and sent for review.",
    updatedHospital,
  });
});

// @desc delete hospital
// @route DELETE /hospitals/:id
// @access Private (Admin)
const deleteHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hospital = await Hospital.findById(id).exec();

  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }

  // only admins can delete verified data
  if (req.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Unauthorized. Only admins can delete records." });
  }

  const hospitalName = hospital.name;
  await hospital.deleteOne();

  res.json({
    message: `Hospital "${hospitalName}" has been permanently removed.`,
  });
});

// @desc Get admin dashboard stats
const getAdminStats = asyncHandler(async (req, res) => {
  try {
    const [totalHospitals, pendingHospitals, liveHospitals, totalUsers] =
      await Promise.all([
        Hospital.countDocuments(),
        Hospital.countDocuments({ verified: false }),
        Hospital.countDocuments({ verified: true }),
        User.countDocuments(),
      ]);

    res.status(200).json({
      totalHospitals,
      pendingHospitals,
      liveHospitals,
      totalUsers,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching dashboard statistics" });
  }
});

export default {
  getHospitals,
  getMySubmissions,
  getHospitalCount,
  getCountryStats,
  getRandomHospitals,
  getUnverifiedHospitals,
  getPendingHospitals,
  approveHospital,
  getHospitalByName,
  findHospitals,
  // searchHospitals,
  getNearbyHospitals,
  getHospitalById,
  getTopHospitals,
  getHospitalsGroupedByCountryTop,
  getHospitalsGroupedByCountry,
  getHospitalsForCountry,
  shareHospitals,
  getSharedHospitals,
  exportHospitals,
  addHospital,
  updateHospital,
  deleteHospital,
  getAdminStats,
};
