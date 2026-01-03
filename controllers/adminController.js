import axios from "axios";
import User from "../models/userModel.js";
import Hospital from "../models/hospitalsModel.js";
import bcrypt from "bcrypt";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";

/**
 * @desc    Get all users for management
 * @route   GET /api/users
 */
const getAllUsersAdmin = asyncHandler(async (req, res) => {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 });
  if (!users) return res.status(404).json({ message: "No users found" });
  res.json(users);
});

/**
 * @desc    Admin manually creates a user
 * @route   POST /api/users
 */
const createUserAdmin = asyncHandler(async (req, res) => {
  const { name, username, email, password, role } = req.body;

  // 1. Validation
  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ message: "Username, email, and password are required" });
  }

  // 2. Check if user already exists
  const userExists = await User.findOne({ $or: [{ email }, { username }] });
  if (userExists) {
    return res
      .status(409)
      .json({ message: "User with this email or username already exists" });
  }

  // 3. Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // 4. Create User
  const newUser = await User.create({
    name,
    username,
    email,
    password: hashedPassword,
    role: role || "user",
  });

  res.status(201).json({
    message: `User ${newUser.username} created successfully`,
    user: { id: newUser._id, username: newUser.username, role: newUser.role },
  });
});

/**
 * @desc    Update any user's role
 * @route   PATCH /api/users/role
 */
const updateUserRoleAdmin = asyncHandler(async (req, res) => {
  const { userId, newRole } = req.body;

  if (!["user", "admin"].includes(newRole)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  // Prevent admin from demoting themselves (to avoid lockouts)
  if (user._id.toString() === req.userId.toString() && newRole !== "admin") {
    return res.status(400).json({ message: "You cannot demote yourself." });
  }

  user.role = newRole;
  await user.save();
  res.json({ message: `User ${user.username} is now a ${newRole}` });
});

// @desc    Toggle user active/suspended status
// @route   PATCH /api/users/status
const toggleUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  user.isActive = !user.isActive;

  await user.save();

  res.status(200).json({
    message: `User ${user.isActive ? "activated" : "suspended"}`,
    isActive: user.isActive,
  });
});

/**
 * @desc    Force delete any user
 * @route   DELETE /api/users/:id
 */
const deleteUserAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: "User not found" });

  // Safety: Prevent admin from deleting themselves
  if (user.email === req.user) {
    return res
      .status(400)
      .json({ message: "You cannot delete your own admin account from here." });
  }

  await user.deleteOne();
  res.json({ message: `User ${user.username} deleted successfully` });
});

// @desc    Get all hospitals (admin view)
// @route   GET /admin/hospitals
const getAllHospitalsAdmin = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find({}).sort({ createdAt: -1 });
  res.json(hospitals);
});

// @desc    Get  hospitals pending (admin view)
// @route   GET /api/hospitals/pending
const getPendingHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find({ verified: false }).sort({
    createdAt: -1,
  });
  res.json(hospitals);
});

// Helper to format hospital data from request body
const formatHospitalData = (body) => {
  const { address, street, city, state, services, comments, hours, ...rest } =
    body;

  return {
    ...rest,
    address: {
      street: street || address?.street || "",
      city: city || address?.city || "",
      state: state || address?.state || "",
    },
    services:
      typeof services === "string"
        ? services
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : Array.isArray(services)
        ? services
        : [],
    comments: Array.isArray(comments) ? comments.filter(Boolean) : [],
    hours: Array.isArray(hours) ? hours.filter((h) => h.day && h.open) : [],
  };
};

/**
 * @desc    Admin manually creates a verified hospital entry
 * @route   POST /apin/hospitals
 */
const createHospitalAdmin = asyncHandler(async (req, res) => {
  const data = formatHospitalData(req.body);

  if (!data.address.city || !data.address.state) {
    return res.status(400).json({ message: "City and State are required." });
  }

  const hospital = await Hospital.create({
    ...data,
    verified: true,
    createdBy: req.userId,
  });
  res.status(201).json(hospital);
});

/**
 * @desc    Admin update hospital details
 * @route   PATCH /api/hospitals/:id
 */
const updateHospitalAdmin = asyncHandler(async (req, res) => {
  const data = formatHospitalData(req.body);

  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $set: data },
    { new: true, runValidators: true }
  );

  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }

  res.status(200).json(hospital);
});

/**
 * @desc    Admin toggle hospital verification status
 * @route   PATCH /api/hospitals/:id/toggle-status
 */
const toggleHospitalStatus = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findById(req.params.id);

  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }

  // Flip the boolean
  hospital.verified = !hospital.verified;
  await hospital.save();

  res.status(200).json({
    message: `Hospital is now ${hospital.verified ? "Live" : "Hidden"}`,
    verified: hospital.verified,
  });
});

/**
 * @desc    Admin reviews, fixes, and approves a pending hospital
 * @route   PATCH /api/hospitals/review-approve/:id
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
    { new: true, runValidators: true }
  );

  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }

  res.status(200).json({ message: "Hospital approved!", hospital });
});

const checkDuplicateHospital = asyncHandler(async (req, res) => {
  const { name, city, currentId } = req.query;

  if (!name || !city) {
    return res.status(400).json({ message: "Name and City are required." });
  }

  const query = {
    name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    "address.city": { $regex: new RegExp(`^${city.trim()}$`, "i") },
  };

  if (currentId && currentId !== "undefined") {
    query._id = { $ne: currentId };
  }

  const duplicate = await Hospital.findOne(query).select("name address.city");

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
 * @route   DELETE /api/hospitals/:id
 */
const deleteHospitalAdmin = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findByIdAndDelete(req.params.id);
  if (!hospital) return res.status(404).json({ message: "Hospital not found" });

  res.status(200).json({ message: "Hospital deleted successfully" });
});

// @desc    Import hospitals from Google Places
// @route   POST /api/hospitals/import-google
// @access  Admin Only
const importFromGoogle = asyncHandler(async (req, res) => {
  const { city, targetCountry } = req.body;

  if (!city || !targetCountry) {
    return res.status(400).json({ message: "City and Country are required" });
  }

  const query = `Hospitals in ${city}, ${targetCountry}`;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const googleUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query
  )}&key=${apiKey}`;

  let googleData;
  try {
    const response = await axios.get(googleUrl);
    if (
      response.data.status !== "OK" &&
      response.data.status !== "ZERO_RESULTS"
    ) {
      return res
        .status(400)
        .json({ message: `Google API Error: ${response.data.status}` });
    }
    googleData = response.data.results;
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to connect to Google Maps" });
  }
  if (!googleData || googleData.length === 0) {
    return res
      .status(404)
      .json({ message: `No hospitals found in ${city}, ${targetCountry}.` });
  }

  let importedCount = 0;
  let skippedCount = 0;

  // 2. Process each result
  for (const place of googleData) {
    const name = place.name;
    const googleAddress = place.formatted_address || "";
    const lat = place.geometry?.location?.lat;
    const lng = place.geometry?.location?.lng;
    const review = place.review;

    // 3. DUPLICATE CHECK
    const exists = await Hospital.findOne({
      name: name,
      "address.city": city,
    });

    if (exists) {
      skippedCount++;
      continue;
    }

    // 4. Create the Hospital Draft
    const newHospital = new Hospital({
      name: name,
      address: {
        street: googleAddress.split(",")[0] || "Imported Address",
        city: city,
        state: targetCountry,
        country: targetCountry,
      },
      longitude: lng,
      latitude: lat,
      verified: false,
      isFeatured: false,
      photoUrl: place.photos ? "https://maps.googleapis.com" : "",
      type: "Public",
      services: ["General Healthcare"],
      comments: [`Imported from Google. Reviews: ${review}/5`],
      createdBy: new mongoose.Types.ObjectId(req.userId),
    });

    await newHospital.save();
    importedCount++;
  }

  res.status(200).json({
    message: `Import complete. Added ${importedCount} new hospitals. Skipped ${skippedCount} duplicates.`,
    imported: importedCount,
    skipped: skippedCount,
  });
});

export default {
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
  checkDuplicateHospital,
  deleteHospitalAdmin,
  importFromGoogle,
};
