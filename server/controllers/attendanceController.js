import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Holiday from '../models/Holiday.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const dateKeyOf = (d) => new Date(d).toISOString().slice(0, 10); // 'YYYY-MM-DD'

// Build an inclusive month range [start, nextMonthStart) for filtering.
const monthRange = (month, year) => {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (!m || !y) return null;
  return { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
};

// ---------- Attendance ----------

const upsertAttendance = async ({ userId, body, markedBy }) => {
  const date = body.date ? new Date(body.date) : new Date();
  const dateKey = dateKeyOf(date);
  const update = {
    date,
    status: body.status || 'Present',
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    workedHours: body.workedHours ?? 0,
    isOvertime: Boolean(body.isOvertime),
    overtimeHours: body.overtimeHours ?? 0,
    notes: body.notes,
    markedBy
  };
  return Attendance.findOneAndUpdate(
    { userId, dateKey },
    { $set: update, $setOnInsert: { userId, dateKey } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
};

/** POST /api/attendance/mark — employee marks their own attendance for a day. */
export const markMyAttendance = asyncHandler(async (req, res) => {
  const record = await upsertAttendance({ userId: req.user._id, body: req.body, markedBy: req.user._id });
  res.status(200).json({ success: true, message: 'Attendance recorded', record });
});

/** GET /api/attendance/mine?month&year — the caller's attendance. */
export const listMyAttendance = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  const range = monthRange(req.query.month, req.query.year);
  if (range) filter.date = range;
  const records = await Attendance.find(filter).sort({ date: -1 });
  res.status(200).json({ success: true, data: records });
});

/** POST /api/attendance — HR marks/edits attendance for an employee. */
export const markAttendance = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.userId)) throw new ApiError(400, 'Valid userId is required');
  const record = await upsertAttendance({ userId: req.body.userId, body: req.body, markedBy: req.user._id });
  res.status(200).json({ success: true, message: 'Attendance recorded', record });
});

/** GET /api/attendance?userId&month&year — HR view. */
export const listAttendance = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    filter.userId = req.query.userId;
  }
  const range = monthRange(req.query.month, req.query.year);
  if (range) filter.date = range;
  const records = await Attendance.find(filter).sort({ date: -1 }).limit(1000);
  res.status(200).json({ success: true, data: records });
});

// ---------- Leave ----------

/** POST /api/leaves — apply for leave (self). */
export const applyLeave = asyncHandler(async (req, res) => {
  const { type, fromDate, toDate, days, reason } = req.body;
  if (!type || !fromDate || !toDate) throw new ApiError(400, 'type, fromDate and toDate are required');
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (to < from) throw new ApiError(400, 'toDate cannot be before fromDate');
  const computedDays = days || (Math.round((to - from) / 86400000) + 1);

  const leave = await LeaveRequest.create({
    userId: req.user._id, type, fromDate: from, toDate: to, days: computedDays, reason
  });
  res.status(201).json({ success: true, message: 'Leave request submitted', leave });
});

/** GET /api/leaves/mine — caller's leave requests. */
export const listMyLeaves = asyncHandler(async (req, res) => {
  const leaves = await LeaveRequest.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: leaves });
});

/** GET /api/leaves?status&userId — approval queue (HR). */
export const listLeaves = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 }).limit(500);
  res.status(200).json({ success: true, data: leaves });
});

/** PATCH /api/leaves/:id/decision — approve/reject (HR). Body: { status, note } */
export const decideLeave = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid leave id');
  const { status, note } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) throw new ApiError(400, 'status must be Approved or Rejected');
  const leave = await LeaveRequest.findById(req.params.id);
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (leave.status !== 'Pending') throw new ApiError(400, `Leave is already ${leave.status}`);
  leave.status = status;
  leave.approverId = req.user._id;
  leave.decidedAt = new Date();
  leave.decisionNote = note;
  await leave.save();
  res.status(200).json({ success: true, message: `Leave ${status.toLowerCase()}`, leave });
});

/** PATCH /api/leaves/:id/cancel — employee cancels their own pending leave. */
export const cancelLeave = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid leave id');
  const leave = await LeaveRequest.findById(req.params.id);
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (String(leave.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only cancel your own leave');
  if (leave.status !== 'Pending') throw new ApiError(400, 'Only pending leave can be cancelled');
  leave.status = 'Cancelled';
  await leave.save();
  res.status(200).json({ success: true, message: 'Leave cancelled', leave });
});

// ---------- Holidays ----------

/** POST /api/holidays — add a holiday (HR). */
export const createHoliday = asyncHandler(async (req, res) => {
  const { date, name, optional } = req.body;
  if (!date || !name) throw new ApiError(400, 'date and name are required');
  const d = new Date(date);
  const holiday = await Holiday.findOneAndUpdate(
    { dateKey: dateKeyOf(d) },
    { $set: { date: d, name, optional: Boolean(optional) }, $setOnInsert: { dateKey: dateKeyOf(d) } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  res.status(201).json({ success: true, message: 'Holiday saved', holiday });
});

/** GET /api/holidays?year — the holiday calendar (any authenticated user). */
export const listHolidays = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.year) {
    const y = parseInt(req.query.year, 10);
    filter.date = { $gte: new Date(Date.UTC(y, 0, 1)), $lt: new Date(Date.UTC(y + 1, 0, 1)) };
  }
  const holidays = await Holiday.find(filter).sort({ date: 1 });
  res.status(200).json({ success: true, data: holidays });
});

/** DELETE /api/holidays/:id (HR). */
export const deleteHoliday = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid holiday id');
  const holiday = await Holiday.findByIdAndDelete(req.params.id);
  if (!holiday) throw new ApiError(404, 'Holiday not found');
  res.status(200).json({ success: true, message: 'Holiday removed' });
});
