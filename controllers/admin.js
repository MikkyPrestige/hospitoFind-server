import axios from 'axios';
import bcrypt from 'bcrypt';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Hospital from '../models/Hospital.js';
import { formatHours, getPhotoUrl, formatHospitalData } from '../utils/hospitalHelpers.js';
import { getUserContinent } from '../utils/matchingEngine.js';
import { scheduleRebuild } from '../utils/debouncedRebuild.js';

// --- ADMIN DASHBOARD ---
/**
 * @desc    Get admin dashboard stats
 * @route   GET /admin/stats
 * @access  Admin Only
 */
const getAdminStats = asyncHandler(async (req, res) => {
  try {
    const [totalHospitals, pendingHospitals, liveHospitals, totalUsers] = await Promise.all([
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
  } catch {
    res.status(500).json({ message: 'Error fetching dashboard statistics' });
  }
});

// --- USER MANAGEMENT ---
/**
 * @desc    Get all users for management
 * @route   GET /admin/users
 * @access  Admin Only
 */
const getAllUsersAdmin = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};

  const [users, total] = await Promise.all([
    User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    users,
  });
});

/**
 * @desc    Admin manually creates a user
 * @route   POST /admin/users
 * @access  Admin Only
 */
const createUserAdmin = asyncHandler(async (req, res) => {
  const { name, username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  const userExists = await User.findOne({ $or: [{ email }, { username }] });
  if (userExists) {
    return res.status(409).json({ message: 'User with this email or username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await User.create({
    name,
    username,
    email,
    password: hashedPassword,
    role: role || 'user',
  });

  res.status(201).json({
    message: `User ${newUser.username} created successfully`,
    user: { id: newUser._id, username: newUser.username, role: newUser.role },
  });
});

/**
 * @desc    Update any user's role
 * @route   PATCH /admin/users/role
 * @access  Admin Only
 */
const updateUserRoleAdmin = asyncHandler(async (req, res) => {
  const { userId, newRole } = req.body;

  if (!['user', 'admin'].includes(newRole)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (user._id.toString() === req.userId.toString() && newRole !== 'admin') {
    return res.status(400).json({ message: 'You cannot demote yourself.' });
  }

  user.role = newRole;
  await user.save();
  res.json({ message: `User ${user.username} is now a ${newRole}` });
});

/**
 * @desc    Toggle user active/suspended status
 * @route   PATCH /admin/users/status
 * @access  Admin Only
 */
const toggleUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  user.isActive = !user.isActive;

  await user.save();

  res.status(200).json({
    message: `User ${user.isActive ? 'activated' : 'suspended'}`,
    isActive: user.isActive,
  });
});

/**
 * @desc    Force delete any user
 * @route   DELETE /admin/users/:id
 * @access  Admin Only
 */
const deleteUserAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (user.email === req.user) {
    return res.status(400).json({ message: 'You cannot delete your own admin account from here.' });
  }

  await user.deleteOne();
  res.json({ message: `User ${user.username} deleted successfully` });
});

// --- HOSPITAL MANAGEMENT ---
// @desc    Get all hospitals
// @route   GET /admin/hospitals
// @access  Admin Only
const getAllHospitalsAdmin = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};

  const [hospitals, total] = await Promise.all([
    Hospital.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Hospital.countDocuments(filter),
  ]);

  res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hospitals,
  });
});

/**
 * @desc    Get  hospitals pending
 * @route   GET /admin/hospitals/pending
 * @access  Admin Only
 */
const getPendingHospitals = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { verified: false };

  const [hospitals, total] = await Promise.all([
    Hospital.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Hospital.countDocuments(filter),
  ]);

  return res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hospitals,
  });
});

/**
 * @desc    Admin manually creates a verified hospital entry
 * @route   POST /admin/hospitals
 * @access  Admin Only
 */
const createHospitalAdmin = asyncHandler(async (req, res) => {
  const data = formatHospitalData(req.body);

  if (!data.address.city || !data.address.state) {
    return res.status(400).json({ message: 'City and State are required.' });
  }

  const hospital = await Hospital.create({
    ...data,
    verified: true,
    createdBy: req.userId,
  });
  scheduleRebuild();
  res.status(201).json(hospital);
});

/**
 * @desc    Admin update hospital details
 * @route   PATCH /admin/hospitals/:id
 * @access  Admin Only
 */
const updateHospitalAdmin = asyncHandler(async (req, res) => {
  const data = formatHospitalData(req.body);

  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $set: data },
    { new: true, runValidators: true },
  );

  if (!hospital) {
    return res.status(404).json({ message: 'Hospital not found' });
  }

  scheduleRebuild();

  res.status(200).json(hospital);
});

/**
 * @desc    Admin toggle hospital verification status
 * @route   PATCH /admin/hospitals/:id/toggle-status
 * @access  Admin Only
 */
const toggleHospitalStatus = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findById(req.params.id);

  if (!hospital) {
    return res.status(404).json({ message: 'Hospital not found' });
  }

  hospital.verified = !hospital.verified;
  await hospital.save();

  scheduleRebuild();

  res.status(200).json({
    message: `Hospital is now ${hospital.verified ? 'Live' : 'Hidden'}`,
    verified: hospital.verified,
  });
});

/**
 * @desc    Admin reviews, fixes, and approves a pending hospital
 * @route   PATCH /admin/hospitals/review-approve/:id
 * @access  Admin Only
 */
const reviewAndApproveHospital = asyncHandler(async (req, res) => {
  const data = formatHospitalData(req.body);

  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        ...data,
        verified: true,
      },
    },
    { new: true, runValidators: true },
  );

  if (!hospital) {
    return res.status(404).json({ message: 'Hospital not found' });
  }

  scheduleRebuild();

  res.status(200).json({ message: 'Hospital approved!', hospital });
});

/**
 * @desc    Batch approve pending hospitals
 * @route   PATCH /admin/hospitals/approve-batch
 * @access  Admin Only
 */
const batchApproveHospitals = asyncHandler(async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Provide an array of hospital IDs' });
  }

  const result = await Hospital.updateMany(
    { _id: { $in: ids }, verified: false },
    { $set: { verified: true } },
  );

  res.status(200).json({
    message: `${result.modifiedCount} hospital(s) approved.`,
    modifiedCount: result.modifiedCount,
  });
});

/**
 * @desc    Check for duplicates
 * @route   GET /admin/hospitals/check-duplicate
 * @access  Admin Only
 */
const checkDuplicateHospital = asyncHandler(async (req, res) => {
  const { name, city, currentId } = req.query;

  if (!name || !city) {
    return res.status(400).json({ message: 'Name and City are required.' });
  }

  const query = {
    name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    'address.city': { $regex: new RegExp(`^${city.trim()}$`, 'i') },
  };

  if (currentId && currentId !== 'undefined') {
    query._id = { $ne: currentId };
  }

  const duplicate = await Hospital.findOne(query).select('name address.city');

  if (duplicate) {
    return res.status(200).json({
      isDuplicate: true,
      message: `Possible duplicate found: "${duplicate.name}" in ${duplicate.address.city}.`,
    });
  }

  res.status(200).json({ isDuplicate: false });
});

/**
 * @desc    Admin delete hospital
 * @route   DELETE /admin/hospitals/:id
 * @access  Admin Only
 */
const deleteHospitalAdmin = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findByIdAndDelete(req.params.id);
  if (!hospital) return res.status(404).json({ message: 'Hospital not found' });

  res.status(200).json({ message: 'Hospital deleted successfully' });
});

// --- GOOGLE IMPORT ---
// @desc    Import hospitals from Google Places
// @route   POST /admin/hospitals/import-google
// @access  Admin Only
const importFromGoogle = asyncHandler(async (req, res) => {
  const { city, targetCountry } = req.body;

  if (!city || !targetCountry) {
    return res.status(400).json({ message: 'City and Country are required' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const query = `Hospitals in ${city}, ${targetCountry}`;
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query,
  )}&key=${apiKey}`;

  let searchResults;
  try {
    const response = await axios.get(searchUrl);
    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      return res.status(400).json({ message: `Google API Error: ${response.data.status}` });
    }
    searchResults = response.data.results;
  } catch {
    return res.status(500).json({ message: 'Failed to connect to Google Search' });
  }

  if (!searchResults || searchResults.length === 0) {
    return res.status(404).json({ message: `No hospitals found in ${city}, ${targetCountry}.` });
  }

  let importedCount = 0;
  let skippedCount = 0;

  for (const place of searchResults) {
    const exists = await Hospital.findOne({
      name: place.name,
      'address.city': city,
    });
    if (exists) {
      skippedCount++;
      continue;
    }

    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,opening_hours,photos,reviews,types,geometry&key=${apiKey}`;

    let details;
    try {
      const detailRes = await axios.get(detailsUrl);
      details = detailRes.data.result;
    } catch {
      console.log(`Skipping details for ${place.name} due to error`);
      continue;
    }

    if (!details) continue;

    const realPhotoUrl = details.photos
      ? getPhotoUrl(details.photos[0].photo_reference, apiKey)
      : '';
    const hoursFormatted = formatHours(details.opening_hours);

    // Map Reviews to Comments (Take top 3)
    const googleComments = details.reviews
      ? details.reviews.slice(0, 3).map((r) => `"${r.text}" - ${r.author_name} (Google Review)`)
      : [`Imported from Google`];

    const validServices = details.types
      ? details.types
          .filter((t) => !['point_of_interest', 'establishment', 'hospital', 'health'].includes(t))
          .map((t) => t.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()))
      : ['General Healthcare'];

    if (validServices.length === 0) validServices.push('General Medical Services');

    const newHospital = new Hospital({
      name: details.name,
      address: {
        street: details.formatted_address?.split(',')[0] || 'Imported Address',
        city: city,
        state: targetCountry,
        country: targetCountry,
      },
      phoneNumber: details.formatted_phone_number || '',
      website: details.website || '',
      email: '',
      photoUrl: realPhotoUrl,
      longitude: details.geometry?.location?.lng,
      latitude: details.geometry?.location?.lat,
      hours: hoursFormatted,
      comments: googleComments,
      services: validServices,
      type: 'Public',
      verified: false,
      isFeatured: false,
      createdBy: new mongoose.Types.ObjectId(req.userId),
    });

    await newHospital.save();
    importedCount++;
  }

  res.status(200).json({
    message: `Import complete. Added ${importedCount} rich-data hospitals. Skipped ${skippedCount}.`,
    imported: importedCount,
    skipped: skippedCount,
  });
});

// --- OSM IMPORT ---
// @desc    Import hospitals from OpenStreetMap (Overpass API)
// @route   POST /admin/hospitals/import-osm
// @access  Admin Only
const importFromOsm = asyncHandler(async (req, res) => {
  const { city, targetCountry } = req.body;

  if (!city || !targetCountry) {
    return res.status(400).json({ message: 'City and Country are required' });
  }

  // Overpass QL: find hospitals within the country, matching city name
  const overpassQuery = `
    [out:json][timeout:60];
    area["name"="${targetCountry}"]->.country;
    (
      node["amenity"="hospital"](area.country)["addr:city"="${city}"];
      way["amenity"="hospital"](area.country)["addr:city"="${city}"];
      relation["amenity"="hospital"](area.country)["addr:city"="${city}"];
    );
    out center;
  `;

  let elements;
  try {
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
    const response = await axios.get(url, {
      timeout: 90000,
      headers: {
        'User-Agent': 'HospitoFind/1.0 (admin import tool)',
      },
    });
    elements = response.data.elements;
  } catch (err) {
    console.error('OSM Import Error:', err.response?.data || err.message);
    return res.status(500).json({
      message: 'Failed to connect to OpenStreetMap',
      error: err.response?.data || err.message,
    });
  }

  if (!elements || elements.length === 0) {
    return res.status(404).json({ message: `No hospitals found in ${city}, ${targetCountry}.` });
  }

  const dryRun = req.query.dryRun === 'true';
  const preview = [];
  const limit = Math.min(parseInt(req.query.limit) || 50, 100); // cap at 100 max

  let importedCount = 0;
  let skippedCount = 0;

  for (const el of elements) {
    const tags = el.tags || {};
    const lat = el.lat || el.center?.lat;
    const lon = el.lon || el.center?.lon;

    const name = tags.name || tags['name:en'] || 'Unnamed Hospital';
    const exists = await Hospital.findOne({
      name: name,
      'address.city': city,
    });
    if (exists) {
      skippedCount++;
      continue;
    }

    const hospitalData = {
      name,
      address: {
        street: tags['addr:street'] || '',
        city: city,
        state: targetCountry,
        country: targetCountry,
      },
      phoneNumber: tags.phone || tags['contact:phone'] || '',
      website: tags.website || tags['contact:website'] || '',
      email: '',
      photoUrl: '',
      longitude: lon,
      latitude: lat,
      hours: tags.opening_hours ? [{ day: 'See OSM', open: tags.opening_hours }] : [],
      comments: ['Imported from OpenStreetMap'],
      services: tags['healthcare:speciality']
        ? tags['healthcare:speciality'].split(';').map((s) =>
            s
              .trim()
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (l) => l.toUpperCase()),
          )
        : ['General Healthcare'],
      type: tags.healthcare || 'Hospital',
      continent: getUserContinent(targetCountry),
      verified: false,
      isFeatured: false,
      createdBy: dryRun ? req.userId : new mongoose.Types.ObjectId(req.userId),
    };

    if (dryRun) {
      preview.push(hospitalData);
      importedCount++;
      if (importedCount >= limit) break;
    } else {
      await Hospital.create(hospitalData);
      importedCount++;
      if (importedCount >= limit) break;
    }
  }

  if (dryRun) {
    return res.status(200).json({
      message: `DRY RUN — Would import ${importedCount} hospitals (capped at ${limit}). Skipped ${skippedCount} duplicates.`,
      imported: importedCount,
      skipped: skippedCount,
      preview,
    });
  }

  res.status(200).json({
    message: `Import complete. Added ${importedCount} hospitals (capped at ${limit}). Skipped ${skippedCount} duplicates.`,
    imported: importedCount,
    skipped: skippedCount,
  });
});

export default {
  getAdminStats,
  getAllUsersAdmin,
  createUserAdmin,
  updateUserRoleAdmin,
  toggleUserStatus,
  deleteUserAdmin,
  getAllHospitalsAdmin,
  getPendingHospitals,
  createHospitalAdmin,
  updateHospitalAdmin,
  toggleHospitalStatus,
  reviewAndApproveHospital,
  batchApproveHospitals,
  checkDuplicateHospital,
  deleteHospitalAdmin,
  importFromGoogle,
  importFromOsm,
};
