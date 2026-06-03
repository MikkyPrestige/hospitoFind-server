import asyncHandler from "express-async-handler";
import SymptomMapping from "../models/SymptomMapping.js";

// @desc Get all symptom mappings
// @route GET /api/v1/admin/symptoms
export const getSymptomMappings = asyncHandler(async (req, res) => {
  const mappings = await SymptomMapping.find().lean();
  res.json(mappings);
});

// @desc Create a symptom mapping
// @route POST /api/v1/admin/symptoms
export const createSymptomMapping = asyncHandler(async (req, res) => {
  const { symptomKeywords, services } = req.body;

  if (!symptomKeywords?.length || !services?.length) {
    return res
      .status(400)
      .json({ message: "symptomKeywords and services are required arrays" });
  }

  const mapping = await SymptomMapping.create({ symptomKeywords, services });
  res.status(201).json(mapping);
});

// @desc Update a symptom mapping
// @route PUT /api/v1/admin/symptoms/:id
export const updateSymptomMapping = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { symptomKeywords, services } = req.body;

  const mapping = await SymptomMapping.findById(id);
  if (!mapping)
    return res.status(404).json({ message: "Symptom mapping not found" });

  if (symptomKeywords) mapping.symptomKeywords = symptomKeywords;
  if (services) mapping.services = services;
  await mapping.save();

  res.json(mapping);
});

// @desc Delete a symptom mapping
// @route DELETE /api/v1/admin/symptoms/:id
export const deleteSymptomMapping = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const mapping = await SymptomMapping.findById(id);
  if (!mapping)
    return res.status(404).json({ message: "Symptom mapping not found" });

  await mapping.deleteOne();
  res.json({ message: "Symptom mapping deleted" });
});
