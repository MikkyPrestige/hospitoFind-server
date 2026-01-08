import asyncHandler from "express-async-handler";
import ids from "short-id";
import papa from "papaparse";
import mongoose from "mongoose";
import Hospital from "../models/Hospital.js";
import ShareableLink from "../models/Share.js";
import User from "../models/User.js";
import { getCoordinates } from "../utils/geocode.js";
import { normalizeCountry, getDistance } from "../utils/locationHelper.js";
import { escapeRegex } from "../utils/stringUtils.js";

// In-memory cache for nearby hospitals
const nearbyCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

let cachedFeatured = [];
let lastFeaturedFetch = 0;
const FEATURED_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

/* =====================================================
    READ OPERATIONS (Public)
===================================================== */
// @desc Get all verified hospitals
// @route GET /hospitals
const getHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find({ verified: true }).lean();
  if (!hospitals || hospitals.length === 0) {
    return res.status(404).json({ message: "No verified hospitals found" });
  }
  return res.json(hospitals);
});

// @desc  Get total count (Verified)
const getHospitalCount = asyncHandler(async (req, res) => {
  const count = await Hospital.countDocuments({ verified: true });
  res.json({ total: count });
});

// @desc Get hospital stats by country
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

// @desc Get random hospitals
// @route GET /hospitals/random
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

// @desc Get hospital by name (Verified Only)
// @route GET /hospitals/:name
const getHospitalByName = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const hospital = await Hospital.findOne({ name, verified: true }).lean();
  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }
  return res.json(hospital);
});

// @desc Get hospital by ID (Verified Only)
// @route GET /hospitals/:id
// @access Public
const getHospitalById = asyncHandler(async (req, res) => {
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
    res.status(404).json({ message: "Hospital not found" });
  } catch (err) {
    res.status(500).json({ message: "Server error fetching hospital" });
  }
});

// @desc   Get Hospital By Slug
// @route  GET /hospitals/:country/:city/:slug
const getHospitalBySlug = asyncHandler(async (req, res) => {
  const { country, city, slug } = req.params;

  try {
    //  Strict match
    let hospital = await Hospital.findOne({
      slug,
      "address.state": country,
      "address.city": city,
    }).lean();

    // Slug only match
    if (!hospital) {
      hospital = await Hospital.findOne({ slug }).lean();
    }

    // Name Regex match (fallback)
    if (!hospital) {
      hospital = await Hospital.findOne({
        name: { $regex: new RegExp(`^${slug.replace(/-/g, " ")}`, "i") },
      }).lean();
    }

    // ID match
    if (!hospital && mongoose.Types.ObjectId.isValid(slug)) {
      hospital = await Hospital.findById(slug).lean();
    }

    if (!hospital)
      return res.status(404).json({ message: "Hospital not found" });

    return res.json(hospital);
  } catch (err) {
    return res.status(500).json({ message: "Server error fetching hospital" });
  }
});

/* =====================================================
    SEARCH & DISCOVERY (Public)
===================================================== */
// @desc Find hospitals (Smart Search) (Name, City, State/Country)
// @route GET /hospitals/find?term=... OR ?city=...&state=...
const findHospitals = asyncHandler(async (req, res) => {
  let { term, city, state } = req.query;

  // Dropdown Click (Precision Search)
  if (city && state) {
    const query = {
      verified: true,
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

  // Manual Typing (Smart Text Search)
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

  // Logic: "City Country" splitting
  orConditions.push({ "address.city": { $regex: new RegExp(safe, "i") } });

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
  let hospitals = await Hospital.find(query).lean().limit(100);

  // Sorting: Best Match First
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

    return 0;
  });

  return res.status(200).json(hospitals || []);
});

// @desc Get nearby hospitals based on lat/lon or IP
// @route GET /hospitals/nearby
const getNearbyHospitals = async (req, res) => {
  const { lat, lon, limit } = req.query;
  const max = parseInt(limit) || 3;
  const maxRadiusMeters = 500000; // 500km

  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);
  const hasLocation = !isNaN(userLat) && !isNaN(userLon);

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

    if (hasLocation) {
      try {
        // Geospatial Query
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

    if (!results.length) {
      fallback = true;
      message = hasLocation
        ? "No nearby hospitals. Showing top picks."
        : "Showing verified global hospitals.";

      results = await Hospital.aggregate([
        { $match: { verified: true } },
        { $sample: { size: max } },
      ]);
    }

    if (hasLocation) {
      results = results.map((h) => {
        const hLon = h.location?.coordinates?.[0] ?? h.longitude;
        const hLat = h.location?.coordinates?.[1] ?? h.latitude;

        if (hLat !== undefined && hLon !== undefined) {
          const dist = getDistance(
            { lat: userLat, lon: userLon },
            { lat: hLat, lon: hLon }
          );
          return {
            ...h,
            distance: `${(dist / 1000).toFixed(1)} km`,
          };
        }
        return h;
      });
    }

    const responseData = { results, fallback, message };
    nearbyCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return res.json(responseData);
  } catch (err) {
    console.error("Critical Search Error:", err);
    return res.status(500).json({ message: "Search service unavailable" });
  }
};

// @desc    Get top featured hospitals
// @route   GET /hospitals/featured
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

/* =====================================================
    EXPLORE & FILTERING (Public)
===================================================== */
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

  const query = {
    verified: true,
    "address.state": { $regex: new RegExp(`^${escapeRegex(rawParam)}$`, "i") },
  };

  const total = await Hospital.countDocuments(query);
  const hospitals = await Hospital.find(query).skip(skip).limit(limit).lean();

  const formatted = hospitals.map((doc) => ({
    ...doc,
    address: { ...doc.address, country: normalizeCountry(doc.address?.state) },
  }));

  res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hospitals: formatted,
  });
});

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

/* =====================================================
    USER ACTIONS (Private/Public Mixed)
===================================================== */
// @desc Get user submissions
// @route GET /hospitals/mine
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

// @desc add new hospital
// @route POST /hospitals
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
const updateHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id)
    return res.status(400).json({ message: "Hospital ID is required in URL" });

  const hospital = await Hospital.findById(id);
  if (!hospital) return res.status(404).json({ message: "Hospital not found" });

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

/* =====================================================
    SHARING & EXPORT
===================================================== */
// @desc share hospitals (Verified Only)
// @route POST /hospitals/share
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

// @desc Get shared link
// @route GET /hospitals/share/:linkId
// @access Public
const getSharedHospitals = asyncHandler(async (req, res) => {
  const { linkId } = req.params;

  // Find the shareable link document by linkId
  const link = await ShareableLink.findOne({ linkId }).lean();

  if (!link) {
    return res
      .status(404)
      .json({ message: "This share link has expired or invalid." });
  }

  return res.status(200).json(link.hospitals);
});

// @dec export hospitals to CSV
// @route GET /hospitals/export
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
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="verified_hospitals_export.csv"'
  );

  return res.status(200).send(csv);
});

/* =====================================================
    ADMIN OPERATIONS
===================================================== */
// @desc Admin Pending List
// @route GET /hospitals/admin/pending
const getPendingHospitals = asyncHandler(async (req, res) => {
  const pending = await Hospital.find({ verified: false })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(pending);
});

// @desc Admin Approve
// @route PATCH /hospitals/:id/approve
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

// @desc Admin Delete
// @route DELETE /hospitals/:id
// @access Private (Admin)
const deleteHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hospital = await Hospital.findById(id).exec();

  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }
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
// @desc Get unverified hospitals(Get sandbox)
// @route GET /hospitals/sandbox
const getUnverifiedHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find({ verified: false }).lean();

  if (!hospitals || hospitals.length === 0) {
    return res.status(200).json([]);
  }
  return res.json(hospitals);
});

export default {
  getHospitals,
  getHospitalCount,
  getCountryStats,
  getRandomHospitals,
  getHospitalByName,
  getHospitalById,
  getHospitalBySlug,
  findHospitals,
  getNearbyHospitals,
  getTopHospitals,
  getHospitalsGroupedByCountry,
  getHospitalsForCountry,
  getHospitalsGroupedByCountryTop,
  getMySubmissions,
  addHospital,
  updateHospital,
  shareHospitals,
  getSharedHospitals,
  exportHospitals,
  getPendingHospitals,
  approveHospital,
  deleteHospital,
  getAdminStats,
  getUnverifiedHospitals,
};
