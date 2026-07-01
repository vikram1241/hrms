import mongoose from 'mongoose';
import PerformanceReview from '../models/PerformanceReview.js';
import { Incentive, Appraisal, TrainingRecord } from '../models/performanceExtras.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const ensureUserId = (id) => { if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Valid userId is required'); };

// ---------- Performance reviews ----------

export const createReview = asyncHandler(async (req, res) => {
  ensureUserId(req.body.userId);
  const { userId, period, kpis, overallRating, comments, status } = req.body;
  if (!period) throw new ApiError(400, 'period is required');
  const review = await PerformanceReview.create({
    userId, period, kpis: kpis || [], overallRating: overallRating || 0, comments,
    reviewerId: req.user._id, status: status === 'Published' ? 'Published' : 'Draft'
  });
  res.status(201).json({ success: true, message: 'Review saved', review });
});

export const updateReview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid review id');
  const review = await PerformanceReview.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  ['period', 'kpis', 'overallRating', 'comments', 'status'].forEach((k) => {
    if (req.body[k] !== undefined) review[k] = req.body[k];
  });
  await review.save();
  res.status(200).json({ success: true, message: 'Review updated', review });
});

export const listReviews = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const data = await PerformanceReview.find(filter).sort({ createdAt: -1 }).limit(500);
  res.status(200).json({ success: true, data });
});

/** Employees see only their own published reviews. */
export const listMyReviews = asyncHandler(async (req, res) => {
  const data = await PerformanceReview.find({ userId: req.user._id, status: 'Published' }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data });
});

// ---------- Incentives ----------

export const createIncentive = asyncHandler(async (req, res) => {
  ensureUserId(req.body.userId);
  const { userId, period, amount, reason, status } = req.body;
  if (!period || amount == null) throw new ApiError(400, 'period and amount are required');
  const incentive = await Incentive.create({ userId, period, amount, reason, status });
  res.status(201).json({ success: true, message: 'Incentive recorded', incentive });
});

export const listIncentives = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const data = await Incentive.find(filter).sort({ createdAt: -1 }).limit(500);
  res.status(200).json({ success: true, data });
});

export const listMyIncentives = asyncHandler(async (req, res) => {
  const data = await Incentive.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data });
});

// ---------- Appraisals / promotions ----------

export const createAppraisal = asyncHandler(async (req, res) => {
  ensureUserId(req.body.userId);
  const { userId, effectiveDate, previousDesignation, newDesignation, previousCTC, newCTC, remarks } = req.body;
  if (!effectiveDate) throw new ApiError(400, 'effectiveDate is required');
  const appraisal = await Appraisal.create({ userId, effectiveDate, previousDesignation, newDesignation, previousCTC, newCTC, remarks });
  res.status(201).json({ success: true, message: 'Appraisal recorded', appraisal });
});

export const listAppraisals = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const data = await Appraisal.find(filter).sort({ effectiveDate: -1 }).limit(500);
  res.status(200).json({ success: true, data });
});

// ---------- Training records (manual log) ----------

export const createTrainingRecord = asyncHandler(async (req, res) => {
  ensureUserId(req.body.userId);
  const { userId, title, provider, completedAt, status, certificateFileUrl } = req.body;
  if (!title) throw new ApiError(400, 'title is required');
  const record = await TrainingRecord.create({ userId, title, provider, completedAt, status, certificateFileUrl });
  res.status(201).json({ success: true, message: 'Training record saved', record });
});

export const listTrainingRecords = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const data = await TrainingRecord.find(filter).sort({ createdAt: -1 }).limit(500);
  res.status(200).json({ success: true, data });
});

export const listMyTrainingRecords = asyncHandler(async (req, res) => {
  const data = await TrainingRecord.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data });
});
