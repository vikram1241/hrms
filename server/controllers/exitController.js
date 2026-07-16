import mongoose from 'mongoose';
import ExitRecord from '../models/ExitRecord.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateCompanyDocPdf } from '../services/pdfService.js';
import { logActivity } from '../services/activityService.js';

const fullName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim();

/** POST /api/exits — initiate offboarding for an employee. */
export const initiateExit = asyncHandler(async (req, res) => {
  const { userId, resignationDate, lastWorkingDay, reason } = req.body;
  if (!mongoose.isValidObjectId(userId)) throw new ApiError(400, 'Valid userId is required');
  if (!resignationDate || !lastWorkingDay) throw new ApiError(400, 'resignationDate and lastWorkingDay are required');
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Employee not found');

  const record = await ExitRecord.create({ userId, resignationDate, lastWorkingDay, reason, status: 'Initiated' });
  await logActivity({
    actor: req.user,
    action: 'exit.initiate',
    entityType: 'ExitRecord',
    entityId: record._id,
    message: `Exit initiated for ${fullName(user) || user.email}`
  });
  res.status(201).json({ success: true, message: 'Exit initiated', record });
});

/** GET /api/exits?status */
export const listExits = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const data = await ExitRecord.find(filter).sort({ createdAt: -1 }).limit(500);
  res.status(200).json({ success: true, data });
});

/** GET /api/exits/:id */
export const getExit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const record = await ExitRecord.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Exit record not found');
  res.status(200).json({ success: true, record });
});

/** PATCH /api/exits/:id — update interview, F&F, asset-return checklist, status. */
export const updateExit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const record = await ExitRecord.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Exit record not found');

  if (req.body.exitInterview) {
    record.exitInterview = {
      conductedAt: req.body.exitInterview.conductedAt || record.exitInterview.conductedAt,
      notes: req.body.exitInterview.notes ?? record.exitInterview.notes,
      conductedById: req.body.exitInterview.conductedById || req.user._id
    };
  }
  if (Array.isArray(req.body.assetReturnChecklist)) record.assetReturnChecklist = req.body.assetReturnChecklist;
  if (req.body.fnfSettlement) {
    Object.assign(record.fnfSettlement, req.body.fnfSettlement);
    if (req.body.fnfSettlement.status === 'Settled' && !record.fnfSettlement.settledAt) record.fnfSettlement.settledAt = new Date();
  }
  if (req.body.status && ['Initiated', 'InProgress', 'Completed'].includes(req.body.status)) record.status = req.body.status;
  await record.save();
  res.status(200).json({ success: true, message: 'Exit record updated', record });
});

/**
 * POST /api/exits/:id/letters — generate the sealed relieving + experience
 * letters for the employee (Epic 14, reuses the company-doc generator).
 */
export const generateExitLetters = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const record = await ExitRecord.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Exit record not found');
  const user = await User.findById(record.userId);
  if (!user) throw new ApiError(404, 'Employee not found');
  const company = await Company.findById(req.user.companyId);

  const name = fullName(user);
  const designation = user.employeeDetails?.designation || 'Employee';
  const doj = user.employeeDetails?.dateOfJoining ? new Date(user.employeeDetails.dateOfJoining).toDateString() : 'the date of joining';
  const lwd = new Date(record.lastWorkingDay).toDateString();
  const companyName = company?.name || 'the Company';

  record.relievingLetterUrl = await generateCompanyDocPdf({
    title: 'Relieving Letter', company, employeeName: name, designation, effectiveDate: record.lastWorkingDay,
    paragraphs: [
      `This is to certify that ${name} (${designation}) has been relieved from the services of ${companyName} with effect from the close of business on ${lwd}.`,
      `We confirm that all dues have been settled as per company policy. We wish ${name} success in future endeavours.`
    ]
  });
  record.experienceLetterUrl = await generateCompanyDocPdf({
    title: 'Experience Letter', company, employeeName: name, designation, effectiveDate: record.lastWorkingDay,
    paragraphs: [
      `This is to certify that ${name} was employed with ${companyName} as ${designation} from ${doj} to ${lwd}.`,
      `During the tenure, their conduct and performance were found to be satisfactory.`
    ]
  });
  await record.save();
  await logActivity({
    actor: req.user,
    action: 'exit.letters',
    entityType: 'ExitRecord',
    entityId: record._id,
    message: `Exit letters generated for ${name}`
  });

  res.status(200).json({
    success: true,
    message: 'Relieving and experience letters generated',
    relievingLetterUrl: record.relievingLetterUrl,
    experienceLetterUrl: record.experienceLetterUrl
  });
});

/** DELETE /api/exits/:id — only when Initiated and no letters issued. */
export const deleteExit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const record = await ExitRecord.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Exit record not found');
  if (record.status === 'Completed') {
    throw new ApiError(400, 'Completed exits cannot be deleted');
  }
  if (record.relievingLetterUrl || record.experienceLetterUrl) {
    throw new ApiError(400, 'Exit with generated letters cannot be deleted');
  }
  if (record.status !== 'Initiated') {
    throw new ApiError(400, 'Only exits in Initiated status can be deleted');
  }
  const user = await User.findById(record.userId).select('personalDetails email');
  await record.deleteOne();
  await logActivity({
    actor: req.user,
    action: 'exit.delete',
    entityType: 'ExitRecord',
    entityId: req.params.id,
    message: `Exit record deleted for ${user ? fullName(user) || user.email : 'employee'}`
  });
  res.status(200).json({ success: true, message: 'Exit record deleted' });
});
