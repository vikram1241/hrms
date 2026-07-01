import mongoose from 'mongoose';
import User from '../models/User.js';
import OfferLetter from '../models/OfferLetter.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import SalarySlip from '../models/SalarySlip.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import PerformanceReview from '../models/PerformanceReview.js';
import { Incentive, Appraisal, TrainingRecord } from '../models/performanceExtras.js';
import Asset from '../models/Asset.js';
import EmployeeDocument from '../models/EmployeeDocument.js';
import EmployeeDocumentRecord from '../models/EmployeeDocumentRecord.js';
import ExitRecord from '../models/ExitRecord.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { provisionEmployee } from '../services/provisioningService.js';
import { generateToken } from '../utils/tokens.js';
import { sendPasswordSetup } from '../services/emailService.js';
import { PERMISSIONS, roleHasPermission } from '../config/permissions.js';

const SETUP_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const clientOrigin = () => process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const displayName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email;

const toPublicUser = (user) => {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  delete obj.passwordSetup;
  return obj;
};

/**
 * GET /api/users
 * US 2.1 / 2.2 — paginated directory, default 10 most-recently-modified users,
 * with a single search row plus role / status / department filters.
 * Soft-deleted records are excluded unless ?includeDeleted=true.
 *
 * Query: page, limit, search, role, status (active|inactive), department, includeDeleted
 */
export const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const { search, role, status, department, includeDeleted } = req.query;

  const filter = {};
  if (includeDeleted !== 'true') filter.deletedAt = null;
  if (role) filter.role = role;
  if (department) filter['employeeDetails.department'] = department;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  if (search && search.trim()) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { 'personalDetails.firstName': rx },
      { 'personalDetails.lastName': rx },
      { 'employeeDetails.employeeId': rx },
      { email: rx }
    ];
  }

  const [data, total] = await Promise.all([
    User.find(filter)
      .select('-password -passwordSetup')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter)
  ]);

  res.status(200).json({
    success: true,
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

/** GET /api/users/:id */
export const getUserById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid user id');
  const user = await User.findById(req.params.id).select('-password -passwordSetup');
  if (!user || user.deletedAt) throw new ApiError(404, 'User not found');
  res.status(200).json({ success: true, user });
});

/**
 * GET /api/users/:id/overview
 * Consolidated "Employee 360" — the full record of one employee across every
 * module, section by section, for the admin/HR detail view. All sub-queries are
 * tenant-scoped by the plugin, so only the caller's company data is returned.
 */
export const getEmployeeOverview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid user id');
  const user = await User.findById(id).select('-password -passwordSetup');
  if (!user || user.deletedAt) throw new ApiError(404, 'User not found');

  const [
    compensation, payslips, attendance, leaves, reviews, incentives,
    appraisals, trainingRecords, assets, generatedDocs, uploadedRecords, exit, offer
  ] = await Promise.all([
    EmployeeSalaryAssignment.findOne({ userId: id }),
    SalarySlip.find({ employeeId: id }).sort({ year: -1, month: -1 }).limit(24),
    Attendance.find({ userId: id }).sort({ date: -1 }).limit(60),
    LeaveRequest.find({ userId: id }).sort({ createdAt: -1 }),
    PerformanceReview.find({ userId: id }).sort({ createdAt: -1 }),
    Incentive.find({ userId: id }).sort({ createdAt: -1 }),
    Appraisal.find({ userId: id }).sort({ effectiveDate: -1 }),
    TrainingRecord.find({ userId: id }).sort({ createdAt: -1 }),
    Asset.find({ assignedTo: id }).sort({ issuedAt: -1 }),
    EmployeeDocument.find({ userId: id }).sort({ createdAt: -1 }),
    EmployeeDocumentRecord.find({ userId: id }).populate('documentTypeId', 'name section kind').sort({ createdAt: -1 }),
    ExitRecord.findOne({ userId: id }).sort({ createdAt: -1 }),
    OfferLetter.findOne({ candidateEmail: user.email }).sort({ createdAt: -1 }).select('-accessTokenHash')
  ]);

  res.status(200).json({
    success: true,
    user,
    compensation,
    payslips,
    attendance,
    leaves,
    performance: { reviews, incentives, appraisals, trainingRecords },
    assets,
    documents: { generated: generatedDocs, uploaded: uploadedRecords },
    exit,
    offer
  });
});

// Fields an admin/HR may mutate via the directory. Salary/payslip data and the
// password hash are intentionally excluded.
const EDITABLE = {
  'personalDetails.firstName': 'firstName',
  'personalDetails.lastName': 'lastName',
  'contactInfo.personalMobile': 'phone',
  role: 'role',
  isActive: 'isActive',
  'employeeDetails.designation': 'designation',
  'employeeDetails.department': 'department',
  'employeeDetails.employeeId': 'employeeId',
  // Epic 8 employment + statutory fields, HR/Admin-editable.
  'employeeDetails.employmentType': 'employmentType',
  'employeeDetails.workLocation': 'workLocation',
  'employeeDetails.reportingManagerId': 'reportingManagerId',
  'employeeDetails.dateOfJoining': 'dateOfJoining',
  'employeeDetails.esiNumber': 'esiNumber',
  'employeeDetails.professionalTaxNumber': 'professionalTaxNumber'
};

/**
 * PUT /api/users/:id
 * US 2.3 — edit a directory record. Admin/HR only (enforced at route).
 */
export const updateUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid user id');
  const user = await User.findById(req.params.id);
  if (!user || user.deletedAt) throw new ApiError(404, 'User not found');

  // Role changes are a privileged, admin-only mutation (Epic R). HR may edit
  // every other field but cannot escalate/alter roles.
  if (req.body.role !== undefined && req.body.role !== user.role
      && !roleHasPermission(req.user.role, PERMISSIONS.USER_ROLE_CHANGE)) {
    throw new ApiError(403, 'You are not permitted to change user roles');
  }

  for (const [path, bodyKey] of Object.entries(EDITABLE)) {
    if (req.body[bodyKey] !== undefined) user.set(path, req.body[bodyKey]);
  }

  await user.save();
  res.status(200).json({ success: true, message: 'User updated', user: toPublicUser(user) });
});

/**
 * DELETE /api/users/:id
 * US 2.3 — safe soft-delete. Sets deletedAt + deactivates; record is retained.
 */
export const softDeleteUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid user id');

  if (req.user._id.equals(req.params.id)) {
    throw new ApiError(400, 'You cannot delete your own account');
  }

  const user = await User.findById(req.params.id);
  if (!user || user.deletedAt) throw new ApiError(404, 'User not found');

  user.deletedAt = new Date();
  user.isActive = false;
  await user.save();

  res.status(200).json({ success: true, message: 'User soft-deleted' });
});

/**
 * POST /api/users/:id/credentials
 * Admin/HR-triggered provisioning: ensure an employee ID + active status and
 * (re)generate a temporary password, emailing the credentials to the user.
 * Enriches designation/department/joining from their latest offer if present.
 */
export const generateCredentials = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid user id');
  const user = await User.findById(req.params.id);
  if (!user || user.deletedAt) throw new ApiError(404, 'User not found');

  const offer = await OfferLetter.findOne({ candidateEmail: user.email }).sort({ createdAt: -1 });
  const result = await provisionEmployee(user, { offer: offer || undefined });

  res.status(200).json({
    success: true,
    message: `Login credentials emailed to ${user.email}`,
    employeeId: result.employeeId,
    ...(process.env.NODE_ENV !== 'production' ? { tempPassword: result.tempPassword } : {})
  });
});

/**
 * POST /api/users/:id/reset-link
 * Admin/HR-triggered password reset: mints a single-use setup token and emails
 * the user a link to set a new password (consumed by POST /candidate/setup-password).
 * Useful when a user forgets their password.
 */
export const sendPasswordResetLink = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid user id');
  const user = await User.findById(req.params.id);
  if (!user || user.deletedAt) throw new ApiError(404, 'User not found');

  const { raw, hash } = generateToken();
  user.passwordSetup = { tokenHash: hash, expiresAt: new Date(Date.now() + SETUP_TTL_MS) };
  await user.save();

  const setupUrl = `${clientOrigin()}/setup-password/${raw}`;
  await sendPasswordSetup({ to: user.email, fullName: displayName(user), setupUrl });

  res.status(200).json({
    success: true,
    message: `Password reset link emailed to ${user.email}`,
    ...(process.env.NODE_ENV !== 'production' ? { setupUrl } : {})
  });
});

/** POST /api/users/:id/restore — undo a soft-delete. */
export const restoreUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid user id');
  const user = await User.findById(req.params.id);
  if (!user || !user.deletedAt) throw new ApiError(404, 'No soft-deleted user found');

  user.deletedAt = null;
  await user.save();
  res.status(200).json({ success: true, message: 'User restored', user: toPublicUser(user) });
});
