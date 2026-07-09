import mongoose from 'mongoose';
import LetterTemplate, { LETTER_TYPES, LETTER_PLACEHOLDERS } from '../models/LetterTemplate.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/letter-templates?type= — list letter templates (optionally by type). */
export const listLetterTemplates = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  const data = await LetterTemplate.find(filter).sort({ type: 1, name: 1 });
  res.status(200).json({ success: true, data, meta: { types: LETTER_TYPES, placeholders: LETTER_PLACEHOLDERS } });
});

/** POST /api/letter-templates — create a letter template. */
export const createLetterTemplate = asyncHandler(async (req, res) => {
  const { type, name, title, bodyParagraphs } = req.body;
  if (!LETTER_TYPES.includes(type)) throw new ApiError(400, `type must be one of: ${LETTER_TYPES.join(', ')}`);
  if (!name) throw new ApiError(400, 'name is required');
  const template = await LetterTemplate.create({
    type, name, title, bodyParagraphs: Array.isArray(bodyParagraphs) ? bodyParagraphs : []
  });
  res.status(201).json({ success: true, message: 'Letter template created', template });
});

/** PUT /api/letter-templates/:id */
export const updateLetterTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await LetterTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Letter template not found');
  ['name', 'title', 'bodyParagraphs', 'active'].forEach((k) => {
    if (req.body[k] !== undefined) template[k] = req.body[k];
  });
  await template.save();
  res.status(200).json({ success: true, message: 'Letter template updated', template });
});

/** DELETE /api/letter-templates/:id */
export const deleteLetterTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await LetterTemplate.findByIdAndDelete(req.params.id);
  if (!template) throw new ApiError(404, 'Letter template not found');
  res.status(200).json({ success: true, message: 'Letter template deleted' });
});
