import asyncHandler from "express-async-handler";
import ids from "short-id";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import papa from "papaparse";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Hospital from "../models/hospitalsModel.js";
import ShareableLink from "../models/shareModel.js";
import { getCoordinates } from "../config/geocode.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const hospitalsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/hospitals.json"), "utf-8")
);

// In-memory cache for nearby hospitals
const nearbyCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Haversine formula to calculate distance between two lat/lon points
const haversine = (a, b) => {
  const R = 6371e3; // meters
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const d =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d));
};

// @desc Get all hospitals
// @route GET /hospitals
// @access Public
const getHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find({}).lean();
  // If no hospitals
  if (!hospitals) {
    return res.status(400).json({ message: "No Hospital found" });
  }
  return res.json(hospitals);
});

// get total hospital count
const getHospitalCount = asyncHandler(async (req, res) => {
  const count = await Hospital.countDocuments();
  res.json({ total: count });
});

// @desc Get hospitals randomly
// @route GET /hospitals/random
// @access Public
const getRandomHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.aggregate([{ $sample: { size: 8 } }]);
  // If no hospitals
  if (!hospitals) {
    return res.status(400).json({ message: "No Hospital found" });
  }
  return res.json(hospitals);
});

// @desc Get hospital by name
// @route GET /hospitals/:name
// @access Public
const getHospitalByName = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const hospital = await Hospital.findOne({ name }).lean();
  // If no hospital
  if (!hospital) {
    return res.status(400).json({ message: "Hospital not found" });
  }
  return res.json(hospital);
});

// @desc Find hospitals by general search term (name, street, city, or state)
// @route GET /hospitals/find?term=searchTerm
// @access Public
// Helper: escape a string for use in RegExp
function escapeRegex(text = "") {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const findHospitals = asyncHandler(async (req, res) => {
  let { term } = req.query;

  console.log("🧭 findHospitals term:", JSON.stringify(term)); // DEBUG LINE

  // normalize and validate term
  if (!term || typeof term !== "string") {
    return res.status(400).json({ message: "Search term is required" });
  }

  term = term.trim();
  if (term.length === 0) {
    return res.status(400).json({ message: "Search term is required" });
  }

  if (term.length < 2) {
    return res
      .status(400)
      .json({ message: "Please enter at least 2 characters" });
  }

  // escape regex special chars to prevent "match everything"
  const safe = escapeRegex(term);
  const searchRegex = new RegExp(safe, "i");

  const query = {
    $or: [
      { name: { $regex: searchRegex } },
      { "address.street": { $regex: searchRegex } },
      { "address.city": { $regex: searchRegex } },
      { "address.state": { $regex: searchRegex } },
    ],
  };

  const hospitals = await Hospital.find(query).lean().limit(200);

  console.log(`✅ Found ${hospitals.length} hospitals for "${term}"`);

  return res.status(200).json(hospitals || []);
});

// @desc Search for hospitals by cities or state
// @route GET /hospitals/search?city=city&state=state
// @access Public
const searchHospitals = asyncHandler(async (req, res) => {
  const { address, city, state } = req.query;
  const query = {};
  if (address) {
    query["$or"] = [
      { name: { $regex: new RegExp(address, "i") } },
      { "address.street": { $regex: new RegExp(address, "i") } },
    ];
  }
  if (city) query["address.city"] = { $regex: new RegExp(city, "i") };
  if (state) query["address.state"] = { $regex: new RegExp(state, "i") };

  const hospitals = await Hospital.find(query);
  console.log(`✅ /search matched ${hospitals.length} hospitals for`, query);

  if (hospitals === 0) {
    return res.status(400).json({
      success: false,
      error: "No matching records",
    });
  }

  return res.json(hospitals);
});

//  @desc Get nearby hospitals based on lat/lon or IP
//  @route GET /hospitals/nearby?lat=..&lon=..&limit=..
//  @access Public
const getNearbyHospitals = async (req, res) => {
  const { lat, lon, limit } = req.query;
  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);
  const max = parseInt(limit) || 3;
  const maxRadiusKm = 500;

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.connection.remoteAddress ||
    "unknown";
  const cacheKey = userLat && userLon ? `${userLat},${userLon}` : `ip:${ip}`;

  // ✅ Check cache
  const cached = nearbyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`⚡ Serving cached hospitals for ${cacheKey}`);
    return res.json(cached.data);
  }

  try {
    // 🧩 Try MongoDB first
    let hospitals = [];
    try {
      hospitals = await Hospital.find().lean();
      if (!Array.isArray(hospitals) || hospitals.length === 0) {
        console.warn("⚠️ MongoDB has no hospitals, using local JSON fallback.");
        hospitals = hospitalsData;
      } else {
        console.log(`✅ Loaded ${hospitals.length} hospitals from MongoDB.`);
      }
    } catch (err) {
      console.warn("⚠️ MongoDB query failed, using local JSON fallback:", err);
      hospitals = hospitalsData;
    }

    let results = [];
    let fallbackMessage = "Showing popular hospitals globally.";

    // 📍 User provided location
    if (!isNaN(userLat) && !isNaN(userLon)) {
      const withDistances = hospitals.map((h) => {
        if (typeof h.latitude !== "number" && typeof h.lat !== "number") {
          return { ...h, distance: null, distanceValue: Infinity };
        }

        const km =
          haversine(
            { lat: userLat, lon: userLon },
            { lat: h.latitude ?? h.lat, lon: h.longitude ?? h.lon }
          ) / 1000;

        return {
          ...h,
          distance: !isNaN(km) ? `${km.toFixed(1)} km` : null,
          distanceValue: km,
        };
      });

      const nearby = withDistances
        .filter((h) => h.distanceValue <= maxRadiusKm)
        .sort((a, b) => a.distanceValue - b.distanceValue)
        .slice(0, max);

      if (nearby.length > 0) {
        results = nearby;
        fallbackMessage = "Showing hospitals near your location.";
      } else {
        console.log("⚠️ No hospitals within radius, falling back globally.");
      }
    }

    // 🌍 Fallback to random/global
    if (results.length === 0) {
      results = hospitals.sort(() => 0.5 - Math.random()).slice(0, max);
    }

    const responseData = { results, fallback: true, message: fallbackMessage };
    nearbyCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    console.log(`💾 Cached hospitals for ${cacheKey}`);
    res.json(responseData);
  } catch (err) {
    console.error("❌ Error fetching nearby hospitals:", err);
    res.status(500).json({ message: "Failed to fetch hospitals" });
  }
};

// @desc Get hospital by ID
// @route GET /hospitals/:id
// @access Public
const getHospitalById = async (req, res) => {
  const { id } = req.params;

  try {
    // Try MongoDB first
    const hospital = await Hospital.findById(id).lean();

    if (hospital) {
      let locationString = "";
      if (hospital.address && typeof hospital.address === "object") {
        const { street, city, state } = hospital.address;
        locationString = [street, city, state].filter(Boolean).join(", ");
      }

      return res.json({
        ...hospital,
        location: locationString || "Location unavailable",
      });
    }

    // Fallback to JSON file
    const localHospitals = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../data/hospitals.json"), "utf-8")
    );
    const fallback = localHospitals.find((h) => h._id === id || h.id === id);

    if (fallback) return res.json(fallback);

    res.status(404).json({ message: "Hospital not found" });
  } catch (err) {
    console.error("❌ Error fetching hospital:", err);
    res.status(500).json({ message: "Server error fetching hospital" });
  }
};

let cachedFeatured = [];
let lastFeaturedFetch = 0;
const FEATURED_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// @desc Fallback — return top hospitals (no location access)
const getTopHospitals = async (req, res) => {
  const now = Date.now();

  // Serve from cache if fresh
  if (cachedFeatured.length && now - lastFeaturedFetch < FEATURED_CACHE_TTL) {
    console.log("⚡ Using cached featured hospitals");
  } else {
    try {
      const hospitals = await Hospital.find({ isFeatured: true })
        .limit(20)
        .lean();

      if (!hospitals.length) {
        console.warn("⚠️ No featured hospitals found — using random fallback.");
        const fallback = await Hospital.aggregate([{ $sample: { size: 20 } }]);
        cachedFeatured = fallback;
      } else {
        cachedFeatured = hospitals;
      }

      lastFeaturedFetch = now;
      console.log(`🏥 Cached ${cachedFeatured.length} featured hospitals`);
    } catch (err) {
      console.error("❌ Error fetching featured hospitals:", err);
      return res.status(500).json({ message: "Failed to load top hospitals" });
    }
  }

  // ✅ Randomize and limit results to 3
  const randomized = cachedFeatured.sort(() => 0.5 - Math.random()).slice(0, 3);

  res.json(randomized);
};

// GET /hospitals/explore/top
const getHospitalsGroupedByCountryTop = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find().lean();

  const nigeriaStates = [
    "Abia",
    "Adamawa",
    "Akwa Ibom",
    "Anambra",
    "Bauchi",
    "Bayelsa",
    "Benue",
    "Borno",
    "Cross River",
    "Delta",
    "Ebonyi",
    "Edo",
    "Ekiti",
    "Enugu",
    "Gombe",
    "Imo",
    "Jigawa",
    "Kaduna",
    "Kano",
    "Katsina",
    "Kebbi",
    "Kogi",
    "Kwara",
    "Lagos",
    "Nasarawa",
    "Ogun",
    "Ondo",
    "Osun",
    "Oyo",
    "Plateau",
    "Rivers",
    "Sokoto",
    "Taraba",
    "Yobe",
    "Zamfara",
    "FCT",
    "Abuja",
  ];

  const grouped = {};

  hospitals.forEach((h) => {
    let state = h.address?.state?.trim();
    if (!state) state = "Unknown";

    // Normalize Nigerian states → Nigeria
    const country = nigeriaStates.includes(state) ? "Nigeria" : state;

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
  const hospitals = await Hospital.find().lean();

  const nigeriaStates = [
    "Abia",
    "Adamawa",
    "Akwa Ibom",
    "Anambra",
    "Bauchi",
    "Bayelsa",
    "Benue",
    "Borno",
    "Cross River",
    "Delta",
    "Ebonyi",
    "Edo",
    "Ekiti",
    "Enugu",
    "Gombe",
    "Imo",
    "Jigawa",
    "Kaduna",
    "Kano",
    "Katsina",
    "Kebbi",
    "Kogi",
    "Kwara",
    "Lagos",
    "Nasarawa",
    "Ogun",
    "Ondo",
    "Osun",
    "Oyo",
    "Plateau",
    "Rivers",
    "Sokoto",
    "Taraba",
    "Yobe",
    "Zamfara",
    "FCT",
    "Abuja",
  ];

  const grouped = {};

  hospitals.forEach((h) => {
    let state = h.address?.state?.trim();
    if (!state) state = "Unknown";

    // Normalize Nigerian states → Nigeria
    const country = nigeriaStates.includes(state) ? "Nigeria" : state;

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

  const countryParam = rawParam.toLowerCase();

  const nigeriaStates = [
    "abia",
    "adamawa",
    "akwa ibom",
    "anambra",
    "bauchi",
    "bayelsa",
    "benue",
    "borno",
    "cross river",
    "delta",
    "ebonyi",
    "edo",
    "ekiti",
    "enugu",
    "gombe",
    "imo",
    "jigawa",
    "kaduna",
    "kano",
    "katsina",
    "kebbi",
    "kogi",
    "kwara",
    "lagos",
    "nasarawa",
    "ogun",
    "ondo",
    "osun",
    "oyo",
    "plateau",
    "rivers",
    "sokoto",
    "taraba",
    "yobe",
    "zamfara",
    "fct",
    "abuja",
  ];

  const orConditions = [];

  if (countryParam === "nigeria") {
    nigeriaStates.forEach((s) =>
      orConditions.push({
        "address.state": { $regex: new RegExp(`^${s}$`, "i") },
      })
    );
    orConditions.push({ "address.state": { $regex: /nigeria/i } });
    orConditions.push({ "address.country": { $regex: /nigeria/i } });
  } else {
    orConditions.push({
      "address.state": { $regex: new RegExp(`^${rawParam}$`, "i") },
    });
    orConditions.push({
      "address.country": { $regex: new RegExp(`^${rawParam}$`, "i") },
    });
  }

  const query = { $or: orConditions };

  // count total hospitals before limiting
  const total = await Hospital.countDocuments(query);
  const hospitals = await Hospital.find(query).skip(skip).limit(limit).lean();

  const formatted = hospitals.map((doc) => {
    const rawState = (doc.address?.state || "").trim();
    const isNigeriaState = nigeriaStates.includes(rawState.toLowerCase());
    const country = isNigeriaState
      ? "Nigeria"
      : doc.address?.country
      ? doc.address.country
      : rawState;
    return {
      ...doc,
      address: {
        ...doc.address,
        country,
      },
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

// @desc share hospitals
// @route POST /hospitals/share
// @access Public
const shareHospitals = asyncHandler(async (req, res) => {
  const { address, city, state } = req.body.searchParams;
  const query = {};
  if (address) {
    query["$or"] = [
      { name: { $regex: new RegExp(address, "i") } },
      { "address.street": { $regex: new RegExp(address, "i") } },
    ];
  }
  if (city) query["address.city"] = { $regex: new RegExp(city, "i") };
  if (state) query["address.state"] = { $regex: new RegExp(state, "i") };

  const searchedHospitals = await Hospital.find(query).lean();
  // Generate a unique link identifier
  const linkId = ids.generate();

  const shareableLink = new ShareableLink({
    linkId,
    hospitals: searchedHospitals.map((hospital) => ({
      id: hospital.id,
      name: hospital.name,
      slug: hospital.slug,
      address: {
        street: hospital.address.street,
        city: hospital.address.city,
        state: hospital.address.state,
      },
      phone: hospital.phoneNumber,
      website: hospital.website,
      email: hospital.email,
      photoUrl: hospital.photoUrl,
      type: hospital.type,
      services: hospital.services,
      comments: hospital.comments,
      hours: hospital.hours,
    })),
  });

  await shareableLink.save();
  // Return the generated shareable link to the client
  return res.status(200).json({ shareableLink: linkId });
});

// @desc Retrieve the hospital list associated with a shareable link
// @route GET /hospitals/share/:linkId
// @access Public
const getSharedHospitals = asyncHandler(async (req, res) => {
  const { linkId } = req.params;
  const link = await ShareableLink.findOne({ linkId });

  if (!link) {
    return res.status(404).json({ error: "Link not found" });
  }

  const hospitals = link.hospitals;
  // Return the hospital list to the client
  return res.status(200).json(hospitals);
});

// @dec export hospital
// @route GET /hospitals/export
// @access Public
const exportHospitals = asyncHandler(async (req, res) => {
  const { address, city, state } = req.query;

  const query = {};
  if (address) {
    query["$or"] = [
      { name: { $regex: new RegExp(address, "i") } },
      { "address.street": { $regex: new RegExp(address, "i") } },
    ];
  }
  if (city) query["address.city"] = { $regex: new RegExp(city, "i") };
  if (state) query["address.state"] = { $regex: new RegExp(state, "i") };

  const hospitals = await Hospital.find(query).lean();

  // ✅ Safe mapping (avoid crashes on missing fields)
  const csvData = hospitals.map((hospital) => ({
    name: hospital.name || "",
    street: hospital.address?.street || "",
    city: hospital.address?.city || "",
    state: hospital.address?.state || "",
    phone: hospital.phoneNumber || "",
    website: hospital.website || "",
    email: hospital.email || "",
    photoUrl: hospital.photoUrl || "",
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
          .join(", ")
      : "",
  }));

  const csv = papa.unparse(csvData, { header: true });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="hospitals.csv"');

  res.status(200).send(csv);
});

// @desc add new hospital
// @route POST /hospitals
// @access Public
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
      .json({ message: "Name, City, and State are required" });
  }

  const duplicate = await Hospital.findOne({ name, address }).lean().exec();
  if (duplicate) {
    return res.status(400).json({ message: "Hospital already exists" });
  }

  const fullAddress = `${address.street || ""}, ${address.city}, ${
    address.state
  }`.trim();
  const { longitude, latitude } = await getCoordinates(fullAddress);

  const hospital = await Hospital.create({
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
  });

  return res.status(201).json({
    message: "New hospital created",
    hospital,
  });
});

// @desc update hospital
// @route PATCH /hospitals/:id
// @access Public
const updateHospital = asyncHandler(async (req, res) => {
  const {
    id,
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

  if (!id || !name || !address?.city || !address?.state) {
    return res
      .status(400)
      .json({ message: "ID, Name, City, and State are required" });
  }

  const hospital = await Hospital.findById(id).exec();
  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }

  const duplicate = await Hospital.findOne({
    name,
    "address.city": address.city,
    "address.state": address.state,
  })
    .lean()
    .exec();

  if (duplicate && duplicate._id.toString() !== id) {
    return res.status(400).json({ message: "Hospital already exists" });
  }

  const addressChanged =
    hospital.address.city !== address.city ||
    hospital.address.state !== address.state ||
    hospital.address.street !== address.street;

  hospital.name = name;
  hospital.address = address;
  hospital.phoneNumber = phoneNumber;
  hospital.website = website;
  hospital.email = email;
  hospital.photoUrl = photoUrl;
  hospital.type = type;
  hospital.services = services;
  hospital.comments = comments;
  hospital.hours = hours;

  if (addressChanged) {
    const fullAddress = `${address.street || ""}, ${address.city}, ${
      address.state
    }`.trim();
    const { longitude, latitude } = await getCoordinates(fullAddress);

    // Only update if we got valid coords
    if (longitude && latitude) {
      hospital.longitude = longitude;
      hospital.latitude = latitude;
    } else {
      console.warn(`⚠️ Keeping old coordinates for ${hospital.name}`);
    }
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid hospital ID format" });
  }

  const updatedHospital = await hospital.save();
  return res.json({
    message: `${updatedHospital.name} updated successfully`,
    updatedHospital,
  });
});

// @desc delete hospital
// @route DELETE /hospitals/:id
// @access Public
const deleteHospital = asyncHandler(async (req, res) => {
  // const hospital = await Hospital.findById(req.params.id).exec()
  const { name } = req.body;
  const hospital = await Hospital.findOne({ name }).exec();

  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }
  const result = await hospital.deleteOne();
  res.json(`${result.name} hospital deleted`);
});

export default {
  getHospitals,
  getHospitalCount,
  getRandomHospitals,
  getHospitalByName,
  findHospitals,
  searchHospitals,
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
};
