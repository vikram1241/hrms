import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import SalarySlip from '../models/SalarySlip.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import Attendance from '../models/Attendance.js';
import Company from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { paisaToWords } from '../utils/numberToWords.js';
import { generatePayslipPdf } from '../services/pdfService.js';
import { sendPayslipNotice } from '../services/emailService.js';
import { computeStatutoryDeductions } from '../utils/statutoryEngine.js';
import { logActivity } from '../services/activityService.js';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const maskAccount = (acc) => (acc ? `****${String(acc).slice(-4)}` : '-');

const ledgerFrom = (items) => items.map((i) => ({ label: i.label, amount: i.monthlyAmount }));

/**
 * Build (or refresh) one employee's payslip for a period from their frozen
 * salary breakdown, render the PDF, and persist. Idempotent per (employee, month, year).
 */
const buildSlip = async (assignment, month, year, notify, { applyStatutory = false, workingDays = 30 } = {}) => {
  const user = assignment.userId; // populated
  const b = assignment.frozenMonthlyBreakdown;

  let deductionsLedger = ledgerFrom(b.deductions);
  let totalDeductions = b.totalDeductions;
  let netPay = b.netTakeHome;

  // Epic 16 — statutory run: recompute deductions (PF/ESI/PT/TDS) from earnings
  // plus attendance-based LOP, replacing the template's static deductions.
  if (applyStatutory) {
    const basic = (b.earnings.find((e) => /basic/i.test(e.key || e.label))?.monthlyAmount) || 0;
    const absentDays = await Attendance.countDocuments({
      userId: user._id, status: 'Absent',
      date: { $gte: new Date(Date.UTC(year, month - 1, 1)), $lt: new Date(Date.UTC(year, month, 1)) }
    });
    const { deductions } = computeStatutoryDeductions({
      basicPaisa: basic, grossPaisa: b.grossEarnings, absentDays, workingDays
    });
    deductionsLedger = deductions;
    totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
    netPay = b.grossEarnings - totalDeductions;
  }

  const slipData = {
    employeeId: user._id,
    month,
    year,
    metaSnapshot: {
      employeeDisplayId: user.employeeDetails?.employeeId || 'N/A',
      fullName: `${user.personalDetails.firstName} ${user.personalDetails.lastName}`,
      designation: user.employeeDetails?.designation || 'N/A',
      department: user.employeeDetails?.department || 'N/A',
      pan: user.employeeDetails?.panNumber,
      uan: user.employeeDetails?.uanNumber,
      bankAccountHidden: maskAccount(user.employeeDetails?.bankDetails?.accountNumber)
    },
    earningsLedger: ledgerFrom(b.earnings),
    deductionsLedger,
    financialSummary: {
      grossEarnings: b.grossEarnings,
      totalDeductions,
      netPay,
      netPayInWords: paisaToWords(netPay)
    },
    paymentStatus: 'Paid'
  };

  // Render PDF on the company page template (letter outline when configured).
  const company = await Company.findById(user.companyId);
  const pdfUrl = await generatePayslipPdf(slipData, company);
  slipData.pdfUrl = pdfUrl;

  const slip = await SalarySlip.findOneAndUpdate(
    { employeeId: user._id, month, year },
    slipData,
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  if (notify) {
    await sendPayslipNotice({ to: user.email, fullName: slipData.metaSnapshot.fullName, period: `${MONTHS[month]} ${year}` });
    slip.isEmailed = true;
    await slip.save();
  }
  return slip;
};

/**
 * POST /api/payslips/generate
 * US 4.2 — batch-process monthly payslips for selected employees (or all
 * employees that have a salary assignment).
 * Body: { month, year, employeeIds?: string[], notify?: boolean }
 */
export const generatePayslips = asyncHandler(async (req, res) => {
  const { month, year, employeeIds, notify = false, applyStatutory = false, workingDays = 30 } = req.body;

  const filter = {};
  if (Array.isArray(employeeIds) && employeeIds.length) {
    filter.userId = { $in: employeeIds.filter((id) => mongoose.isValidObjectId(id)) };
  }
  const assignments = await EmployeeSalaryAssignment.find(filter).populate('userId');

  const results = { generated: [], failed: [] };
  for (const assignment of assignments) {
    if (!assignment.userId) continue; // orphaned assignment
    try {
      const slip = await buildSlip(assignment, month, year, notify, { applyStatutory, workingDays });
      results.generated.push({ employeeId: assignment.userId._id, slipId: slip._id });
    } catch (err) {
      results.failed.push({ employeeId: assignment.userId._id, error: err.message });
    }
  }

  if (results.generated.length) {
    await logActivity({
      actor: req.user,
      action: 'payslip.generate',
      entityType: 'SalarySlip',
      message: `${results.generated.length} payslip(s) issued for ${MONTHS[month]} ${year}`
    });
  }

  res.status(201).json({
    success: true,
    message: `Generated ${results.generated.length} payslip(s) for ${MONTHS[month]} ${year}`,
    ...results
  });
});

/** GET /api/payslips?month=&year=&page=&limit= — admin/HR ledger view (US 5 admin). */
export const listPayslips = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const filter = {};
  if (req.query.month) filter.month = Number(req.query.month);
  if (req.query.year) filter.year = Number(req.query.year);

  const [data, total] = await Promise.all([
    SalarySlip.find(filter).sort({ year: -1, month: -1 }).skip((page - 1) * limit).limit(limit),
    SalarySlip.countDocuments(filter)
  ]);
  res.status(200).json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

/**
 * GET /api/payslips/mine?year= — US 7.2, employee's own historical slips.
 */
export const listMyPayslips = asyncHandler(async (req, res) => {
  const filter = { employeeId: req.user._id };
  if (req.query.year) filter.year = Number(req.query.year);
  const data = await SalarySlip.find(filter).sort({ year: -1, month: -1 });
  res.status(200).json({ success: true, data });
});

/**
 * GET /api/payslips/:id/pdf — US 7.3, authorized PDF stream.
 * Employees may only download their own slips; admin/HR may download any.
 * Re-renders the PDF with the current company letter template + watermark so
 * downloads always match the latest Company Settings branding.
 */
export const downloadPayslipPdf = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid payslip id');
  const slip = await SalarySlip.findById(req.params.id);
  if (!slip) throw new ApiError(404, 'Payslip not found');

  const isOwner = slip.employeeId.equals(req.user._id);
  const isManager = ['admin', 'hr'].includes(req.user.role);
  if (!isOwner && !isManager) throw new ApiError(403, 'Not authorized to access this payslip');

  const company = await Company.findById(req.user.companyId || slip.companyId);
  try {
    const pdfUrl = await generatePayslipPdf(slip.toObject ? slip.toObject() : slip, company);
    slip.pdfUrl = pdfUrl;
    await slip.save();
  } catch (err) {
    console.warn('[payslip] re-render with company template failed:', err.message);
  }

  const abs = path.resolve(process.cwd(), slip.pdfUrl);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Payslip file is missing on disk');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${slip.month}-${slip.year}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});
