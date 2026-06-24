import mongoose from 'mongoose';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * POST /api/salary-templates
 * US 4.1 — persist a reusable salary calculation template.
 * Monetary `valueFactor`s for fixed fields are expected in paisa.
 */
export const createTemplate = asyncHandler(async (req, res) => {
  const { name, description, earningsStructure, deductionsStructure } = req.body;
  const template = await SalaryStructureTemplate.create({
    name,
    description,
    earningsStructure: earningsStructure || [],
    deductionsStructure: deductionsStructure || []
  });
  res.status(201).json({ success: true, message: 'Template created', template });
});

/** GET /api/salary-templates?activeOnly=true */
export const listTemplates = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.activeOnly === 'true') filter.isActive = true;
  const templates = await SalaryStructureTemplate.find(filter).sort({ updatedAt: -1 });
  res.status(200).json({ success: true, data: templates });
});

/** GET /api/salary-templates/:id */
export const getTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await SalaryStructureTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Template not found');
  res.status(200).json({ success: true, template });
});

/** PUT /api/salary-templates/:id */
export const updateTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await SalaryStructureTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Template not found');

  ['name', 'description', 'earningsStructure', 'deductionsStructure', 'isActive'].forEach((k) => {
    if (req.body[k] !== undefined) template[k] = req.body[k];
  });
  await template.save();
  res.status(200).json({ success: true, message: 'Template updated', template });
});

/**
 * DELETE /api/salary-templates/:id
 * Soft-deactivates the template (kept for audit; existing assignments hold a
 * frozen breakdown so they are unaffected).
 */
export const deactivateTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await SalaryStructureTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Template not found');
  template.isActive = false;
  await template.save();
  res.status(200).json({ success: true, message: 'Template deactivated' });
});
