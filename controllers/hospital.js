import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import papa from 'papaparse';
import mongoose from 'mongoose';
import Hospital from '../models/Hospital.js';
import ShareableLink from '../models/Share.js';
import User from '../models/User.js';
import Review from '../models/Review.js';
import { getCoordinates } from '../utils/geocode.js';
import { normalizeCountry, getDistance } from '../utils/locationHelper.js';
import { correctSpelling } from '../utils/spellCorrector.js';
import { escapeRegex } from '../utils/stringUtils.js';
import { sanitizeInput } from '../utils/sanitizer.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

// In-memory cache for nearby hospitals
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const FEATURED_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

const MAX_SHARE_HOSPITALS = 100;
const MAX_EXPORT_HOSPITALS = 100;

/* =====================================================
    READ OPERATIONS (Public)
===================================================== */
/**
 * @desc    Get all verified hospitals with pagination
 * @route   GET /hospitals
 * @access  Public
 */
const getHospitals = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 21;
  const skip = (page - 1) * limit;

  const cacheKey = `hospitals:list:page=${page}&limit=${limit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const filter = { verified: true };
  const [hospitals, total] = await Promise.all([
    Hospital.find(filter).skip(skip).limit(limit).lean(),
    Hospital.countDocuments(filter),
  ]);

  const response = {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hospitals,
  };

  await cacheSet(cacheKey, response, 5 * 60 * 1000); // 5 minutes
  return res.json(response);
});

/**
 * @desc    Get total count (Verified)
 * @route   GET /hospitals/count
 * @access  Public
 */
const getHospitalCount = asyncHandler(async (req, res) => {
  const cacheKey = 'hospitals:count';
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const count = await Hospital.countDocuments({ verified: true });
  const result = { total: count };

  await cacheSet(cacheKey, result, 10 * 60 * 1000); // 10 minutes
  res.json(result);
});

/**
 * @desc    Get hospital stats by country
 * @route   GET /hospitals/stats/countries
 * @access  Public
 */
const getCountryStats = asyncHandler(async (req, res) => {
  const cacheKey = 'hospitals:stats:countries';
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const hospitals = await Hospital.find({ verified: true }, { 'address.state': 1 }).lean();
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

  await cacheSet(cacheKey, result, 10 * 60 * 1000); // 10 minutes
  res.json(result);
});

/**
 * @desc    Get random hospitals
 * @route   GET /hospitals/random
 * @access  Public
 */
const getRandomHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.aggregate([
    { $match: { verified: true } },
    { $sample: { size: 8 } },
  ]);

  if (!hospitals || hospitals.length === 0) {
    return res.status(400).json({ message: 'No Hospital found' });
  }
  return res.json(hospitals);
});

/**
 * @desc    Get hospital by name (Verified Only)
 * @route   GET /hospitals/:name
 * @access  Public
 */
const getHospitalByName = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const hospital = await Hospital.findOne({ name, verified: true }).lean();
  if (!hospital) {
    return res.status(404).json({ message: 'Hospital not found' });
  }
  return res.json(hospital);
});

/**
 * @desc    Get hospital by ID (Verified Only)
 * @route   GET /hospitals/:id
 * @access  Public
 */
const getHospitalById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const hospital = await Hospital.findOne({ _id: id, verified: true }).lean();
    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }

    const locationString = [
      hospital.address?.street,
      hospital.address?.city,
      hospital.address?.state,
    ]
      .filter(Boolean)
      .join(', ');

    const [stats, recentReviews] = await Promise.all([
      Review.aggregate([
        { $match: { hospitalId: hospital._id } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
          },
        },
      ]),
      Review.find({ hospitalId: hospital._id }).sort({ createdAt: -1 }).limit(3).lean(),
    ]);

    const reviewStats = stats[0]
      ? {
          averageRating: Math.round(stats[0].averageRating * 10) / 10,
          totalReviews: stats[0].totalReviews,
        }
      : { averageRating: 0, totalReviews: 0 };

    return res.json({
      ...hospital,
      location: locationString || 'Location unavailable',
      reviewStats,
      recentReviews,
    });
  } catch {
    return res.status(500).json({ message: 'Server error fetching hospital' });
  }
});

/**
 * @desc    Get Hospital By Slug
 * @route   GET /hospitals/:country/:city/:slug
 * @access  Public
 */
const getHospitalBySlug = asyncHandler(async (req, res) => {
  const { country, city, slug } = req.params;

  try {
    //  Strict match
    let hospital = await Hospital.findOne({
      slug,
      'address.state': country,
      'address.city': city,
    }).lean();

    // Slug only match
    if (!hospital) {
      hospital = await Hospital.findOne({ slug }).lean();
    }

    // Name Regex match (fallback)
    if (!hospital) {
      hospital = await Hospital.findOne({
        name: { $regex: new RegExp(`^${slug.replace(/-/g, ' ')}`, 'i') },
      }).lean();
    }

    // ID match
    if (!hospital && mongoose.Types.ObjectId.isValid(slug)) {
      hospital = await Hospital.findById(slug).lean();
    }

    if (!hospital) return res.status(404).json({ message: 'Hospital not found' });

    // Attach review stats and recent reviews
    const [stats, recentReviews] = await Promise.all([
      Review.aggregate([
        { $match: { hospitalId: hospital._id } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
          },
        },
      ]),
      Review.find({ hospitalId: hospital._id }).sort({ createdAt: -1 }).limit(3).lean(),
    ]);

    const reviewStats = stats[0]
      ? {
          averageRating: Math.round(stats[0].averageRating * 10) / 10,
          totalReviews: stats[0].totalReviews,
        }
      : { averageRating: 0, totalReviews: 0 };

    return res.json({
      ...hospital,
      reviewStats,
      recentReviews,
    });
  } catch {
    return res.status(500).json({ message: 'Server error fetching hospital' });
  }
});

/* =====================================================
    SEARCH & DISCOVERY (Public)
===================================================== */
/**
 * @desc    Find hospitals (Smart Search) (Name, City, State/Country)
 * @route   GET /hospitals/find?term=... OR ?city=...&state=...
 * @access  Public
 */
const findHospitals = asyncHandler(async (req, res) => {
  let { term, city, state } = req.query;
  let originalTerm = term;
  // Apply spelling correction to each word in the term
  if (term && typeof term === 'string' && term.trim().length >= 2) {
    const original = term.trim();
    term = original.split(/\s+/).map(correctSpelling).join(' ');
    // use the corrected 'term' for the search below
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const skip = (page - 1) * limit;

  // City/State search
  if (city && state) {
    const query = {
      verified: true,
      'address.city': {
        $regex: new RegExp(`^${escapeRegex(city.trim())}$`, 'i'),
      },
      'address.state': {
        $regex: new RegExp(`^${escapeRegex(state.trim())}$`, 'i'),
      },
    };

    const [results, total] = await Promise.all([
      Hospital.find(query).skip(skip).limit(limit).lean(),
      Hospital.countDocuments(query),
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      results,
      correctedTerm: originalTerm && term !== originalTerm ? term : undefined,
    });
  }

  // Free‑text search – use MongoDB text index with phrase matching
  if (!term || typeof term !== 'string' || term.trim().length < 2) {
    return res.status(400).json({ message: 'Please enter at least 2 characters' });
  }

  const cleanTerm = term.trim();
  const escapedTerm = cleanTerm.replace(/"/g, '\\"');

  // Text search with phrase + words
  let textQuery = `"${escapedTerm}" ${escapedTerm}`;
  let query = {
    verified: true,
    $text: { $search: textQuery },
  };

  let [results, total] = await Promise.all([
    Hospital.find(query)
      .sort({ score: { $meta: 'textScore' } })
      .skip(skip)
      .limit(limit)
      .lean(),
    Hospital.countDocuments(query),
  ]);

  // If few results, try words-only text query
  if (total < 3) {
    query.$text.$search = escapedTerm;
    [results, total] = await Promise.all([
      Hospital.find(query)
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limit)
        .lean(),
      Hospital.countDocuments(query),
    ]);
  }

  // Regex fallback for prefix/partial matching
  if (total < 10) {
    const regex = new RegExp(escapeRegex(cleanTerm), 'i');
    query = {
      verified: true,
      $or: [
        { name: regex },
        { 'address.street': regex },
        { 'address.city': regex },
        { 'address.state': regex },
        { services: regex }, // array field matches if any element matches
        { type: regex },
      ],
    };

    [results, total] = await Promise.all([
      Hospital.find(query).skip(skip).limit(limit).lean(),
      Hospital.countDocuments(query),
    ]);
  }

  return res.status(200).json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    results,
    correctedTerm: originalTerm && term !== originalTerm ? term : undefined,
  });
});

/**
 * @desc    Get nearby hospitals based on lat/lon or IP
 * @route   GET /hospitals/nearby
 * @access  Public
 */
const getNearbyHospitals = async (req, res) => {
  const { lat, lon, limit } = req.query;
  const max = parseInt(limit) || 3;
  const maxRadiusMeters = 500000; // 500km

  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);
  const hasLocation = !isNaN(userLat) && !isNaN(userLon);

  const cacheKey = hasLocation ? `geo:${userLat}:${userLon}:${max}` : `ip:${req.ip}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    let results = [];
    let fallback = false;
    let message = 'Showing verified hospitals near you.';

    if (hasLocation) {
      try {
        // Geospatial Query
        results = await Hospital.find({
          verified: true,
          location: {
            $near: {
              $geometry: { type: 'Point', coordinates: [userLon, userLat] },
              $maxDistance: maxRadiusMeters,
            },
          },
        })
          .limit(max)
          .lean();
      } catch {
        const allHospitals = await Hospital.find({ verified: true }).lean();
        results = allHospitals
          .map((h) => {
            // Use legacy lat/lon if location missing
            const hLat = h.location?.coordinates?.[1] ?? h.latitude;
            const hLon = h.location?.coordinates?.[0] ?? h.longitude;
            if (!hLat || !hLon) return { ...h, distanceValue: Infinity };
            const dist = getDistance({ lat: userLat, lon: userLon }, { lat: hLat, lon: hLon });
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
        ? 'No nearby hospitals. Showing top picks.'
        : 'Showing verified global hospitals.';

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
          const dist = getDistance({ lat: userLat, lon: userLon }, { lat: hLat, lon: hLon });
          return {
            ...h,
            distance: `${(dist / 1000).toFixed(1)} km`,
          };
        }
        return h;
      });
    }

    const responseData = { results, fallback, message };
    await cacheSet(cacheKey, responseData, CACHE_TTL);

    return res.json(responseData);
  } catch {
    return res.status(500).json({ message: 'Search service unavailable' });
  }
};

/**
 * @desc    Get top featured hospitals
 * @route   GET /hospitals/featured
 * @access  Public
 */
const getTopHospitals = async (req, res) => {
  const featuredCacheKey = 'featured:hospitals';
  const cachedFeatured = await cacheGet(featuredCacheKey);
  if (cachedFeatured) {
    return res.json(cachedFeatured.sort(() => 0.5 - Math.random()).slice(0, 3));
  }

  try {
    const hospitals = await Hospital.find({ isFeatured: true, verified: true }).limit(20).lean();

    const toCache = hospitals.length
      ? hospitals
      : await Hospital.aggregate([{ $match: { verified: true } }, { $sample: { size: 20 } }]);

    await cacheSet(featuredCacheKey, toCache, FEATURED_CACHE_TTL);

    res.json(cachedFeatured.sort(() => 0.5 - Math.random()).slice(0, 3));
  } catch {
    return res.status(500).json({ message: 'Failed to load top hospitals' });
  }
};

/* =====================================================
    EXPLORE & FILTERING (Public)
===================================================== */
/**
 * @desc    Get hospitals grouped by country
 * @route   GET /hospitals/explore
 * @access  Public
 */
const getHospitalsGroupedByCountry = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50; // hospitals per country
  const cacheKey = 'hospitals:explore';
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json(cached);
  }

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

  // Sort countries by hospital count (descending), then alphabetically
  const result = Object.keys(grouped)
    .sort((a, b) => {
      const diff = grouped[b].length - grouped[a].length;
      return diff !== 0 ? diff : a.localeCompare(b);
    })
    .map((country) => ({
      country,
      hospitals: grouped[country].slice(0, limit),
    }));

  await cacheSet(cacheKey, result, 5 * 60 * 1000); // 5 minutes
  res.json(result);
});

/**
 * @desc    Get hospitals for a specific country
 * @route   GET /hospitals/country/:country
 * @access  Public
 */
const getHospitalsForCountry = asyncHandler(async (req, res) => {
  const rawParam = (req.params.country || '').trim();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const skip = (page - 1) * limit;

  const query = {
    verified: true,
    'address.state': { $regex: new RegExp(`^${escapeRegex(rawParam)}$`, 'i') },
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

/**
 * @desc    Get hospitals grouped by country (Top)
 * @route   GET /hospitals/explore/top
 * @access  Public
 */
const getHospitalsGroupedByCountryTop = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 12; // hospitals per country
  const cacheKey = 'hospitals:explore:top';
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json(cached);
  }

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
      hospitals: grouped[country].slice(0, limit),
    }));

  await cacheSet(cacheKey, result, 5 * 60 * 1000); // 5 minutes
  res.json(result);
});

/* =====================================================
    USER ACTIONS (Private/Public Mixed)
===================================================== */
/**
 * @desc    Get user submissions
 * @route   GET /hospitals/mine
 * @access  Public (Verified) / Private (Unverified)
 */
const getMySubmissions = asyncHandler(async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized: No User ID' });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const userObjectId = new mongoose.Types.ObjectId(req.userId);
  const filter = {
    $or: [{ createdBy: userObjectId }, { createdBy: req.userId }],
  };

  const [hospitals, total] = await Promise.all([
    Hospital.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Hospital.countDocuments(filter),
  ]);

  res.status(200).json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hospitals,
  });
});

/**
 * @desc    Add new hospital
 * @route   POST /hospitals
 * @access  Public (Verified) / Private (Unverified)
 */
const addHospital = asyncHandler(async (req, res) => {
  const cleanBody = sanitizeInput(req.body);

  const { name, address, phoneNumber, website, email, photoUrl, type, services, comments, hours } =
    cleanBody;

  if (!name || !address?.city || !address?.state) {
    return res.status(400).json({ message: 'Name, City, and Country (State) are required' });
  }

  const duplicate = await Hospital.findOne({
    name,
    'address.city': address.city,
    'address.state': address.state,
  })
    .lean()
    .exec();

  if (duplicate) {
    return res.status(400).json({ message: 'This hospital already exists in our records' });
  }

  if (!req.userId) {
    return res.status(401).json({ message: 'User identity not found. Please log in again.' });
  }

  // Get coordinates
  const fullAddress = `${address.street || ''}, ${address.city}, ${address.state}`.trim();
  const { longitude, latitude } = await getCoordinates(fullAddress);

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
    message: 'Hospital submitted successfully and is pending review.',
    hospital: savedHospital,
  });
});

/**
 * @desc    Update hospital
 * @route   PATCH /hospitals/:id
 * @access  Public (Verified) / Private (Unverified)
 */
const updateHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id) return res.status(400).json({ message: 'Hospital ID is required in URL' });

  const hospital = await Hospital.findById(id);
  if (!hospital) return res.status(404).json({ message: 'Hospital not found' });

  if (hospital.verified && req.role !== 'admin') {
    hospital.verified = false;
  }

  Object.assign(hospital, updateData);

  // Re-check coordinates if address changed
  if (updateData.address) {
    const fullAddress = `${updateData.address.street || ''}, ${
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
    message: hospital.verified ? 'Update saved.' : 'Update saved and sent for review.',
    updatedHospital,
  });
});

/* =====================================================
    SHARING & EXPORT
===================================================== */
/**
 * @desc    Share hospitals (Verified Only)
 * @route   POST /hospitals/share
 * @access  Public
 */
const shareHospitals = asyncHandler(async (req, res) => {
  const { address, city, state } = req.body?.searchParams || {};

  const query = { verified: true };

  if (address) {
    query['$or'] = [
      { name: { $regex: new RegExp(address, 'i') } },
      { 'address.street': { $regex: new RegExp(address, 'i') } },
    ];
  }
  if (city) query['address.city'] = { $regex: new RegExp(city, 'i') };
  if (state) query['address.state'] = { $regex: new RegExp(state, 'i') };

  const searchedHospitals = await Hospital.find(query).lean();
  if (!searchedHospitals || searchedHospitals.length === 0) {
    return res.status(404).json({ message: 'No verified hospitals found to share.' });
  }

  const truncated = searchedHospitals.length > MAX_SHARE_HOSPITALS;
  const hospitalsToShare = searchedHospitals.slice(0, MAX_SHARE_HOSPITALS);

  const linkId = crypto.randomUUID();
  const shareableLink = new ShareableLink({
    linkId,
    createdBy: req.userId ? req.userId : null,
    hospitals: hospitalsToShare.map((hospital) => ({
      hospitalId: hospital._id,
      name: hospital.name,
      slug: hospital.slug,
      address: {
        street: hospital.address.street,
        city: hospital.address.city,
        state: hospital.address.state,
      },
      phone: hospital.phoneNumber,
      email: hospital.email,
      website: hospital.website,
      photoUrl: hospital.photoUrl,
      type: hospital.type,
      services: hospital.services,
      verified: hospital.verified,
      latitude: hospital.latitude,
      longitude: hospital.longitude,
    })),
  });

  await shareableLink.save();
  return res.status(201).json({
    message: `Shareable link created${truncated ? ` (limited to ${MAX_SHARE_HOSPITALS} hospitals)` : ''}`,
    linkId,
    totalFound: searchedHospitals.length,
    truncated,
  });
});

/**
 * @desc    Get shared link
 * @route   GET /hospitals/share/:linkId
 * @access  Public
 */
const getSharedHospitals = asyncHandler(async (req, res) => {
  const { linkId } = req.params;

  // Find the shareable link document by linkId
  const link = await ShareableLink.findOne({ linkId }).lean();

  if (!link) {
    return res.status(404).json({ message: 'This share link has expired or invalid.' });
  }

  return res.status(200).json(link.hospitals);
});

/**
 * @desc    Export hospitals to CSV (Verified Only)
 * @route   GET /hospitals/export
 * @access  Public
 */
const exportHospitals = asyncHandler(async (req, res) => {
  const { address, city, state } = req.query;
  const query = { verified: true };

  if (address) {
    query['$or'] = [
      { name: { $regex: new RegExp(address, 'i') } },
      { 'address.street': { $regex: new RegExp(address, 'i') } },
    ];
  }
  if (city) query['address.city'] = { $regex: new RegExp(city, 'i') };
  if (state) query['address.state'] = { $regex: new RegExp(state, 'i') };

  const hospitals = await Hospital.find(query).lean();
  if (!hospitals || hospitals.length === 0) {
    return res.status(404).json({ message: 'No verified records found to export.' });
  }

  const truncated = hospitals.length > MAX_EXPORT_HOSPITALS;
  const hospitalsToExport = hospitals.slice(0, MAX_EXPORT_HOSPITALS);

  // Map hospital data to CSV format
  const csvData = hospitalsToExport.map((hospital) => ({
    name: hospital.name || '',
    street: hospital.address?.street || '',
    city: hospital.address?.city || '',
    country: normalizeCountry(hospital.address?.state),
    phone: hospital.phoneNumber || '',
    website: hospital.website || '',
    email: hospital.email || '',
    type: hospital.type || '',
    services: Array.isArray(hospital.services) ? hospital.services.join(', ') : '',
    comments: Array.isArray(hospital.comments) ? hospital.comments.join(', ') : '',
    hours: Array.isArray(hospital.hours)
      ? hospital.hours
          .map((hour) => `${hour.day || ''}: ${hour.open || ''}`)
          .join(' | ')
          .trim()
      : '',
  }));

  // Convert to CSV string using papaparse
  const csv = papa.unparse(csvData, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="verified_hospitals_export.csv"');
  // Optionally include a custom header to indicate truncation
  if (truncated) {
    res.setHeader('X-Export-Truncated', 'true');
    res.setHeader('X-Export-Total-Found', hospitals.length);
  }

  return res.status(200).send(csv);
});

/**
 * @desc    Autocomplete hospital names & cities
 * @route   GET /hospitals/autocomplete?q=...
 * @access  Public
 */
const autocompleteHospitals = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.json([]);
  }

  const safe = escapeRegex(q.trim());

  // 1. Hospital name / city / address suggestions (limit to 3)
  const hospitalResults = await Hospital.find({
    verified: true,
    $or: [
      { name: { $regex: safe, $options: 'i' } },
      { 'address.city': { $regex: safe, $options: 'i' } },
      { 'address.state': { $regex: safe, $options: 'i' } },
      { 'address.street': { $regex: safe, $options: 'i' } },
    ],
  })
    .select('name address.city address.state slug type')
    .limit(3)
    .lean();

  const suggestions = hospitalResults.map((h) => ({
    name: h.name,
    city: h.address?.city || '',
    state: h.address?.state || '',
    slug: h.slug || '',
    type: h.type || '',
  }));

  // 2. Matching services (distinct values)
  const serviceDocs = await Hospital.find(
    { verified: true, services: { $regex: safe, $options: 'i' } },
    { services: 1 },
  )
    .limit(10)
    .lean();

  const serviceSet = new Set();
  serviceDocs.forEach((doc) => {
    (doc.services || []).forEach((svc) => {
      if (svc.toLowerCase().includes(q.trim().toLowerCase())) {
        serviceSet.add(svc);
      }
    });
  });

  serviceSet.forEach((svc) => {
    if (suggestions.length >= 5) return;
    suggestions.push({
      name: svc,
      city: '',
      state: '',
      slug: '',
      type: 'service', // optional hint
    });
  });

  // 3. Matching hospital types
  const typeDocs = await Hospital.find(
    { verified: true, type: { $regex: safe, $options: 'i' } },
    { type: 1 },
  )
    .limit(10)
    .lean();

  const typeSet = new Set();
  typeDocs.forEach((doc) => {
    if (doc.type && doc.type.toLowerCase().includes(q.trim().toLowerCase())) {
      typeSet.add(doc.type);
    }
  });

  typeSet.forEach((type) => {
    if (suggestions.length >= 5) return;
    suggestions.push({
      name: type,
      city: '',
      state: '',
      slug: '',
      type: 'type', // optional hint
    });
  });

  // 4. Deduplicate by name (case‑insensitive) and trim to 5
  const seen = new Set();
  const final = [];
  for (const s of suggestions) {
    const key = s.name.toLowerCase();
    if (!seen.has(key) && final.length < 5) {
      seen.add(key);
      final.push(s);
    }
  }

  res.json(final);
});

/**
 * @desc    Submit or update a review (authenticated)
 * @route   POST /hospitals/:id/reviews
 * @access  Private
 */
const submitReview = asyncHandler(async (req, res) => {
  const { rating, text } = req.body;
  const hospitalId = req.params.id;
  const userId = req.userId;

  // Check hospital exists
  const hospital = await Hospital.findById(hospitalId);
  if (!hospital) return res.status(404).json({ message: 'Hospital not found' });

  const user = await User.findById(userId).select('name').lean();
  const name = user?.name || 'Anonymous';
  // Upsert: one review per user per hospital
  const review = await Review.findOneAndUpdate(
    { userId, hospitalId },
    { rating, text: text || '', name },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return res.status(200).json({ message: 'Review saved', review });
});

/**
 * @desc    Get reviews for a hospital (paginated)
 * @route   GET /hospitals/:id/reviews
 * @access  Public
 */
const getHospitalReviews = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    Review.find({ hospitalId: id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Review.countDocuments({ hospitalId: id }),
  ]);

  return res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    reviews,
  });
});

/**
 * @desc    Get aggregated review stats for a hospital
 * @route   GET /hospitals/:id/review-stats
 * @access  Public
 */
const getReviewStats = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const stats = await Review.aggregate([
    { $match: { hospitalId: new mongoose.Types.ObjectId(id) } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  const result = stats[0] || { averageRating: 0, totalReviews: 0 };
  return res.json({
    hospitalId: id,
    averageRating: Math.round(result.averageRating * 10) / 10, // one decimal
    totalReviews: result.totalReviews,
  });
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
  autocompleteHospitals,
  submitReview,
  getHospitalReviews,
  getReviewStats,
};
