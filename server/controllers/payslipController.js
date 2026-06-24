import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import SalarySlip from '../models/SalarySlip.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { paisaToWords } from '../utils/numberToWords.js';
import { generatePayslipPdf } from '../services/pdfService.js';
import { sendPayslipNotice } from '../services/emailService.js';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const maskAccount = (acc) => (acc ? `****${String(acc).slice(-4)}` : '-');

const ledgerFrom = (items) => items.map((i) => ({ label: i.label, amount: i.monthlyAmount }));

/**
 * Build (or refresh) one employee's payslip for a period from their frozen
 * salary breakdown, render the PDF, and persist. Idempotent per (employee, month, year).
 */
const buildSlip = async (assignment, month, year, notify) => {
  const user = assignment.userId; // populated
  const b = assignment.frozenMonthlyBreakdown;

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
    deductionsLedger: ledgerFrom(b.deductions),
    financialSummary: {
      grossEarnings: b.grossEarnings,
      totalDeductions: b.totalDeductions,
      netPay: b.netTakeHome,
      netPayInWords: paisaToWords(b.netTakeHome)
    },
    paymentStatus: 'Paid'
  };

  // Render PDF first so we can store its location on the document.
  const pdfUrl = await generatePayslipPdf(slipData);
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
  const { month, year, employeeIds, notify = false } = req.body;

  const filter = {};
  if (Array.isArray(employeeIds) && employeeIds.length) {
    filter.userId = { $in: employeeIds.filter((id) => mongoose.isValidObjectId(id)) };
  }
  const assignments = await EmployeeSalaryAssignment.find(filter).populate('userId');

  const results = { generated: [], failed: [] };
  for (const assignment of assignments) {
    if (!assignment.userId) continue; // orphaned assignment
    try {
      const slip = await buildSlip(assignment, month, year, notify);
      results.generated.push({ employeeId: assignment.userId._id, slipId: slip._id });
    } catch (err) {
      results.failed.push({ employeeId: assignment.userId._id, error: err.message });
    }
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
 */
export const downloadPayslipPdf = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid payslip id');
  const slip = await SalarySlip.findById(req.params.id);
  if (!slip) throw new ApiError(404, 'Payslip not found');

  const isOwner = slip.employeeId.equals(req.user._id);
  const isManager = ['admin', 'hr'].includes(req.user.role);
  if (!isOwner && !isManager) throw new ApiError(403, 'Not authorized to access this payslip');

  const abs = path.resolve(process.cwd(), slip.pdfUrl);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Payslip file is missing on disk');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${slip.month}-${slip.year}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});
