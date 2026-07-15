import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
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

/** GET /api/attendance/mine?month&year&from&to — the caller's attendance. */
export const listMyAttendance = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  const range = monthRange(req.query.month, req.query.year);
  if (range) {
    filter.date = range;
  } else if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) {
      const to = new Date(req.query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setUTCHours(23, 59, 59, 999);
      filter.date.$lte = to;
    }
  }
  const records = await Attendance.find(filter).sort({ date: -1 });
  res.status(200).json({ success: true, data: records });
});

/** POST /api/attendance — HR marks/edits attendance for an employee. */
export const markAttendance = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.userId)) throw new ApiError(400, 'Valid userId is required');
  const record = await upsertAttendance({ userId: req.body.userId, body: req.body, markedBy: req.user._id });
  res.status(200).json({ success: true, message: 'Attendance recorded', record });
});

/**
 * POST /api/attendance/bulk — HR records the same-day status for many employees
 * at once. Body: { userIds:[], date, status, checkIn?, checkOut? }
 */
export const markBulkAttendance = asyncHandler(async (req, res) => {
  const { userIds, date, status, checkIn, checkOut } = req.body;
  if (!Array.isArray(userIds) || !userIds.length) throw new ApiError(400, 'userIds must be a non-empty array');
  const valid = userIds.filter((id) => mongoose.isValidObjectId(id));
  if (!valid.length) throw new ApiError(400, 'No valid userIds provided');

  let count = 0;
  for (const userId of valid) {
    // eslint-disable-next-line no-await-in-loop
    await upsertAttendance({ userId, body: { date, status, checkIn, checkOut }, markedBy: req.user._id });
    count += 1;
  }
  res.status(200).json({ success: true, message: `Attendance recorded for ${count} employee(s)`, count });
});

// Read a cell as a plain value (handles rich-text / hyperlink / formula cells).
const cellVal = (row, idx) => {
  if (!idx) return null;
  const v = row.getCell(idx).value;
  if (v && typeof v === 'object' && 'text' in v) return v.text;
  if (v && typeof v === 'object' && 'result' in v) return v.result;
  return v;
};

/**
 * POST /api/attendance/bulk-upload — import attendance from an .xlsx roster.
 * Header row (case-insensitive), one of employeeId/email required to identify:
 *   employeeId | email | date | status | checkIn | checkOut
 * Malformed rows are reported by index without aborting the batch.
 */
export const bulkUploadAttendance = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file uploaded (field "roster")');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new ApiError(400, 'The spreadsheet has no worksheets');

  const col = {};
  sheet.getRow(1).eachCell((c, idx) => { col[String(c.value).trim().toLowerCase()] = idx; });
  if (!col.employeeid && !col.email) throw new ApiError(400, 'Sheet must have an "employeeId" or "email" column');
  if (!col.date) throw new ApiError(400, 'Sheet must have a "date" column');

  const results = { imported: [], failed: [] };
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const empId = col.employeeid ? cellVal(row, col.employeeid) : null;
    const email = col.email ? cellVal(row, col.email) : null;
    if (!empId && !email) continue; // blank row

    try {
      const query = empId
        ? { 'employeeDetails.employeeId': String(empId).trim().toUpperCase() }
        : { email: String(email).toLowerCase().trim() };
      const user = await User.findOne(query).select('_id');
      if (!user) throw new Error('Employee not found');

      const date = cellVal(row, col.date);
      await upsertAttendance({
        userId: user._id,
        body: {
          date: date ? new Date(date) : new Date(),
          status: (col.status && cellVal(row, col.status)) || 'Present',
          checkIn: col.checkin ? cellVal(row, col.checkin) : undefined,
          checkOut: col.checkout ? cellVal(row, col.checkout) : undefined
        },
        markedBy: req.user._id
      });
      results.imported.push({ row: r, employee: empId || email });
    } catch (err) {
      results.failed.push({ row: r, employee: empId || email, error: err.message });
    }
  }

  res.status(201).json({ success: true, message: `Imported ${results.imported.length}, failed ${results.failed.length}`, ...results });
});

/** GET /api/attendance?userId&month&year&from&to&status — HR attendance register. */
export const listAttendance = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    filter.userId = req.query.userId;
  }
  if (req.query.status) filter.status = req.query.status;

  const range = monthRange(req.query.month, req.query.year);
  if (range) {
    filter.date = range;
  } else if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) {
      const to = new Date(req.query.to);
      // Inclusive end-of-day when a date-only string is passed.
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setUTCHours(23, 59, 59, 999);
      filter.date.$lte = to;
    }
  }

  const records = await Attendance.find(filter)
    .populate('userId', 'email personalDetails.firstName personalDetails.lastName employeeDetails.employeeId')
    .sort({ date: -1 })
    .limit(5000);
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

/** GET /api/leaves?status&userId&type&from&to — leave register (HR). */
export const listLeaves = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;

  // Overlap with [from, to]: leave.fromDate <= to AND leave.toDate >= from
  if (req.query.from || req.query.to) {
    const from = req.query.from ? new Date(req.query.from) : new Date('1970-01-01');
    const to = req.query.to ? new Date(req.query.to) : new Date('2999-12-31');
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ''))) to.setUTCHours(23, 59, 59, 999);
    filter.fromDate = { $lte: to };
    filter.toDate = { $gte: from };
  }

  const leaves = await LeaveRequest.find(filter)
    .populate('userId', 'email personalDetails.firstName personalDetails.lastName employeeDetails.employeeId')
    .sort({ createdAt: -1 })
    .limit(1000);
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
