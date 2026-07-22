import asyncHandler from 'express-async-handler';
import SymptomMapping from '../models/SymptomMapping.js';

/**
 * @desc    Get all symptom mappings with pagination
 * @route   GET /api/v1/admin/symptoms
 * @access  Private/Admin
 */
export const getSymptomMappings = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};

  const [mappings, total] = await Promise.all([
    SymptomMapping.find(filter).skip(skip).limit(limit).lean(),
    SymptomMapping.countDocuments(filter),
  ]);

  res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    mappings,
  });
});

/**
 * @desc    Create a new symptom mapping
 * @route   POST /api/v1/admin/symptoms
 * @access  Private/Admin
 */
export const createSymptomMapping = asyncHandler(async (req, res) => {
  const { symptomKeywords, services } = req.body;

  if (!symptomKeywords?.length || !services?.length) {
    return res.status(400).json({ message: 'symptomKeywords and services are required arrays' });
  }

  const mapping = await SymptomMapping.create({ symptomKeywords, services });
  res.status(201).json(mapping);
});

/**
 * @desc    Update an existing symptom mapping
 * @route   PUT /api/v1/admin/symptoms/:id
 * @access  Private/Admin
 */
export const updateSymptomMapping = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { symptomKeywords, services } = req.body;

  const mapping = await SymptomMapping.findById(id);
  if (!mapping) return res.status(404).json({ message: 'Symptom mapping not found' });

  if (symptomKeywords) mapping.symptomKeywords = symptomKeywords;
  if (services) mapping.services = services;
  await mapping.save();

  res.json(mapping);
});

/**
 * @desc    Delete a symptom mapping
 * @route   DELETE /api/v1/admin/symptoms/:id
 * @access  Private/Admin
 */
export const deleteSymptomMapping = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const mapping = await SymptomMapping.findById(id);
  if (!mapping) return res.status(404).json({ message: 'Symptom mapping not found' });

  await mapping.deleteOne();
  res.json({ message: 'Symptom mapping deleted' });
});
