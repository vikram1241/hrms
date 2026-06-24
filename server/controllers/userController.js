import mongoose from 'mongoose';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

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
  'employeeDetails.employeeId': 'employeeId'
};

/**
 * PUT /api/users/:id
 * US 2.3 — edit a directory record. Admin/HR only (enforced at route).
 */
export const updateUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid user id');
  const user = await User.findById(req.params.id);
  if (!user || user.deletedAt) throw new ApiError(404, 'User not found');

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

/** POST /api/users/:id/restore — undo a soft-delete. */
export const restoreUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid user id');
  const user = await User.findById(req.params.id);
  if (!user || !user.deletedAt) throw new ApiError(404, 'No soft-deleted user found');

  user.deletedAt = null;
  await user.save();
  res.status(200).json({ success: true, message: 'User restored', user: toPublicUser(user) });
});
