import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import OfferLetter from '../models/OfferLetter.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { computeBreakdown } from '../utils/salaryEngine.js';
import { rupeesToPaisa, formatINR } from '../utils/money.js';
import { generateToken } from '../utils/tokens.js';
import { generateOfferLetterPdf } from '../services/pdfService.js';
import { upsertCandidateUser } from '../services/candidateService.js';
import { provisionEmployee } from '../services/provisioningService.js';
import { sendOfferInvite } from '../services/emailService.js';
import { clientOrigin } from '../utils/clientOrigin.js';

const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const exposeToken = () => process.env.NODE_ENV !== 'production';

const resolveTemplate = async ({ templateId, templateName }) => {
  let tpl = null;
  if (templateId && mongoose.isValidObjectId(templateId)) tpl = await SalaryStructureTemplate.findById(templateId);
  else if (templateName) tpl = await SalaryStructureTemplate.findOne({ name: templateName });
  if (!tpl) throw new ApiError(404, `Salary template not found (${templateId || templateName})`);
  return tpl;
};

/**
 * Core offer-staging logic shared by single + bulk creation.
 * Creates/locates the candidate user, freezes their salary assignment,
 * renders the offer PDF, mints a magic-link token, and emails the candidate.
 * @returns {{ offer, accessToken }}
 */
const createOfferCore = async (payload) => {
  const { candidateEmail, fullName, position, department, joiningDate, offerDate } = payload;
  const annualCTC = Number(payload.annualCTC);
  if (!Number.isFinite(annualCTC) || annualCTC <= 0) throw new ApiError(400, 'annualCTC must be a positive number');

  const template = await resolveTemplate(payload);
  const user = await upsertCandidateUser({ email: candidateEmail, fullName });

  const annualCTCPaisa = rupeesToPaisa(annualCTC);
  const breakdown = computeBreakdown(template, annualCTCPaisa);

  const assignment = await EmployeeSalaryAssignment.findOneAndUpdate(
    { userId: user._id },
    { userId: user._id, templateId: template._id, annualCTC: annualCTCPaisa, frozenMonthlyBreakdown: breakdown },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  const pdfFileUrl = await generateOfferLetterPdf({
    fullName, position, department,
    offerDate: offerDate || new Date(),
    joiningDate, breakdown, annualCTC: annualCTCPaisa
  });

  const { raw, hash } = generateToken();
  const offer = await OfferLetter.create({
    candidateEmail: String(candidateEmail).toLowerCase().trim(),
    fullName, position, department,
    offerDate: offerDate || new Date(),
    joiningDate,
    salaryAssignmentId: assignment._id,
    status: 'sent',
    pdfFileUrl,
    accessTokenHash: hash,
    accessTokenExpires: new Date(Date.now() + ACCESS_TOKEN_TTL_MS)
  });

  const offerUrl = `${clientOrigin()}/offer/${raw}`;
  await sendOfferInvite({ to: offer.candidateEmail, fullName, offerUrl });

  return { offer, accessToken: raw, offerUrl };
};

/**
 * POST /api/offers
 * US 3.1 — stage a single electronic offer.
 * Body: { candidateEmail, fullName, position, department, joiningDate, templateId, annualCTC, offerDate? }
 */
export const createOffer = asyncHandler(async (req, res) => {
  const { offer, accessToken, offerUrl } = await createOfferCore(req.body);
  res.status(201).json({
    success: true,
    message: 'Offer staged and sent',
    offer,
    ...(exposeToken() ? { accessToken, offerUrl } : {})
  });
});

const cell = (row, idx) => {
  const v = row.getCell(idx).value;
  if (v && typeof v === 'object' && 'text' in v) return v.text; // rich text / hyperlink
  if (v && typeof v === 'object' && 'result' in v) return v.result; // formula
  return v;
};

/**
 * POST /api/offers/bulk
 * US 3.2 — ingest an .xlsx roster. Header row (row 1) must contain the columns:
 * fullName | email | position | department | annualCTC | joiningDate | templateName
 * Each row is processed independently; malformed rows are reported by index
 * without aborting the batch.
 */
export const bulkCreateOffers = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No roster file uploaded (field "roster")');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, 'The spreadsheet has no worksheets');

  // Map header names -> column index (case-insensitive).
  const headerRow = sheet.getRow(1);
  const colOf = {};
  headerRow.eachCell((c, idx) => { colOf[String(c.value).trim().toLowerCase()] = idx; });

  const required = ['fullname', 'email', 'position', 'department', 'annualctc', 'joiningdate', 'templatename'];
  const missing = required.filter((h) => !colOf[h]);
  if (missing.length) throw new ApiError(400, `Missing required columns: ${missing.join(', ')}`);

  const results = { created: [], failed: [] };
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const email = cell(row, colOf.email);
    if (!email) continue; // skip blank rows

    try {
      const { offer } = await createOfferCore({
        candidateEmail: email,
        fullName: cell(row, colOf.fullname),
        position: cell(row, colOf.position),
        department: cell(row, colOf.department),
        annualCTC: cell(row, colOf.annualctc),
        joiningDate: cell(row, colOf.joiningdate),
        templateName: cell(row, colOf.templatename)
      });
      results.created.push({ row: r, offerId: offer._id, email: offer.candidateEmail });
    } catch (err) {
      results.failed.push({ row: r, email, error: err.message });
    }
  }

  res.status(201).json({
    success: true,
    message: `Processed roster: ${results.created.length} created, ${results.failed.length} failed`,
    ...results
  });
});

// Present a frozen breakdown with formatted display strings.
const presentBreakdown = (assignment) => {
  if (!assignment?.frozenMonthlyBreakdown) return null;
  const b = assignment.frozenMonthlyBreakdown;
  const disp = (items) => items.map((i) => ({ key: i.key, label: i.label, monthlyAmount: i.monthlyAmount, display: formatINR(i.monthlyAmount) }));
  return {
    annualCTC: assignment.annualCTC,
    annualCTCDisplay: formatINR(assignment.annualCTC),
    earnings: disp(b.earnings),
    deductions: disp(b.deductions),
    grossEarnings: b.grossEarnings,
    grossEarningsDisplay: formatINR(b.grossEarnings),
    totalDeductions: b.totalDeductions,
    totalDeductionsDisplay: formatINR(b.totalDeductions),
    netTakeHome: b.netTakeHome,
    netTakeHomeDisplay: formatINR(b.netTakeHome)
  };
};

/**
 * GET /api/offers/mine
 * The authenticated user's own (latest) offer letter + compensation breakdown.
 */
export const getMyOffer = asyncHandler(async (req, res) => {
  const offer = await OfferLetter.findOne({ candidateEmail: req.user.email })
    .sort({ offerDate: -1, createdAt: -1 })
    .select('-accessTokenHash -digitalSignature.signatureBase64')
    .populate({ path: 'salaryAssignmentId' });
  if (!offer) throw new ApiError(404, 'No offer letter is associated with your account');

  const { salaryAssignmentId, ...rest } = offer.toObject();
  res.status(200).json({ success: true, offer: rest, compensation: presentBreakdown(salaryAssignmentId) });
});

/** GET /api/offers/mine/pdf — stream the caller's own (signed, if available) offer PDF. */
export const downloadMyOfferPdf = asyncHandler(async (req, res) => {
  const offer = await OfferLetter.findOne({ candidateEmail: req.user.email }).sort({ offerDate: -1, createdAt: -1 });
  if (!offer) throw new ApiError(404, 'No offer letter found');

  const rel = offer.signedPdfFileUrl || offer.pdfFileUrl;
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Offer PDF is missing on disk');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="offer-${offer._id}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});

/** GET /api/offers?status=&page=&limit= — US 3.3 management matrix. */
export const listOffers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ fullName: rx }, { candidateEmail: rx }, { position: rx }];
  }

  const [data, total] = await Promise.all([
    OfferLetter.find(filter).select('-accessTokenHash').sort({ offerDate: -1 }).skip((page - 1) * limit).limit(limit),
    OfferLetter.countDocuments(filter)
  ]);
  res.status(200).json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

/** GET /api/offers/:id */
export const getOffer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id)
    .select('-accessTokenHash')
    .populate({ path: 'salaryAssignmentId' });
  if (!offer) throw new ApiError(404, 'Offer not found');
  res.status(200).json({ success: true, offer });
});

/**
 * PATCH /api/offers/:id/status — US 3.3 manual state controls.
 * Body: { status: sent|pending|accepted|declined }
 */
export const updateOfferStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id);
  if (!offer) throw new ApiError(404, 'Offer not found');
  offer.status = req.body.status;
  await offer.save();
  res.status(200).json({ success: true, message: `Offer marked ${offer.status}`, offer });
});

/**
 * POST /api/offers/:id/approve — US 5.4 approval gate.
 * HR/Admin approves a candidate-signed offer. Only valid once the candidate has
 * e-signed (status 'signed'). On approval the offer is flipped to 'accepted' and
 * the backing candidate is provisioned into an active employee — assigning an
 * employee ID and emailing login credentials.
 */
export const approveOffer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id).populate({ path: 'salaryAssignmentId' });
  if (!offer) throw new ApiError(404, 'Offer not found');

  if (offer.status === 'accepted') throw new ApiError(400, 'Offer already approved');
  if (offer.status === 'declined') throw new ApiError(400, 'Cannot approve a declined offer');
  if (offer.status !== 'signed') throw new ApiError(400, 'Offer has not been signed by the candidate yet');

  const now = new Date();
  offer.status = 'accepted';
  offer.acceptedAt = now;
  offer.approvedAt = now;
  offer.approvedBy = req.user._id;
  // Consume the magic link now that the offer is fully approved.
  offer.accessTokenHash = null;
  offer.accessTokenExpires = null;
  await offer.save();

  // Provision the candidate into an active employee and email credentials.
  let provisioning = null;
  const userId = offer.salaryAssignmentId?.userId;
  if (userId) {
    const user = await User.findById(userId);
    if (user) provisioning = await provisionEmployee(user, { offer });
  }

  res.status(200).json({
    success: true,
    message: `Offer approved — login credentials emailed to ${offer.candidateEmail}`,
    offer,
    employeeId: provisioning?.employeeId || null,
    credentialsEmailedTo: offer.candidateEmail,
    ...(exposeToken() && provisioning ? { tempPassword: provisioning.tempPassword } : {})
  });
});

/** GET /api/offers/:id/pdf — stream the (signed, if available) offer PDF. */
export const downloadOfferPdf = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id);
  if (!offer) throw new ApiError(404, 'Offer not found');

  const rel = offer.signedPdfFileUrl || offer.pdfFileUrl;
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Offer PDF is missing on disk');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="offer-${offer._id}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});

/** POST /api/offers/:id/resend — US 3.3, re-mint the magic link and re-email. */
export const resendOffer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status === 'accepted') throw new ApiError(400, 'Offer already accepted');

  const { raw, hash } = generateToken();
  offer.accessTokenHash = hash;
  offer.accessTokenExpires = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
  await offer.save();

  const offerUrl = `${clientOrigin()}/offer/${raw}`;
  await sendOfferInvite({ to: offer.candidateEmail, fullName: offer.fullName, offerUrl });

  res.status(200).json({ success: true, message: 'Offer reminder sent', ...(exposeToken() ? { accessToken: raw, offerUrl } : {}) });
});
