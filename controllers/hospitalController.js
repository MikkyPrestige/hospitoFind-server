import Hospital from "../models/hospitalsModel.js";
import ShareableLink from "../models/shareModel.js";
import { getCoordinates } from "../config/geocode.js";
import asyncHandler from "express-async-handler";
import ids from "short-id";
// import { createObjectCsvWriter } from "csv-writer";
import papa from "papaparse";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

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

// @desc Get hospitals randomly
// @route GET /hospitals/random
// @access Public
const getRandomHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.aggregate([{ $sample: { size: 3 } }]);
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

  const csvData = hospitals.map((hospital) => ({
    name: hospital.name,
    street: hospital.address.street,
    city: hospital.address.city,
    state: hospital.address.state,
    phone: hospital.phoneNumber,
    website: hospital.website,
    email: hospital.email,
    photoUrl: hospital.photoUrl,
    type: hospital.type,
    services: hospital.services.join(", "),
    comments: hospital.comments.join(", "),
    hours: hospital.hours.map((hour) => `${hour.day}: ${hour.open}`).join(", "),
  }));

  const csv = papa.unparse(csvData, { header: true });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="hospitals.csv"');
  res.send(csv);
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
  getRandomHospitals,
  getHospitalByName,
  findHospitals,
  searchHospitals,
  shareHospitals,
  getSharedHospitals,
  exportHospitals,
  addHospital,
  updateHospital,
  deleteHospital,
};
