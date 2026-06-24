import crypto from 'node:crypto';
import OfferLetter from '../models/OfferLetter.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { hashToken } from '../utils/tokens.js';
import { bakeSignatureOnOffer } from '../services/pdfService.js';
import { provisionEmployee } from '../services/provisioningService.js';
import { formatINR } from '../utils/money.js';

const exposeToken = () => process.env.NODE_ENV !== 'production';

/** Look up a live (non-expired) offer by its raw magic-link token. */
const findOfferByToken = async (rawToken) => {
  const offer = await OfferLetter.findOne({
    accessTokenHash: hashToken(rawToken),
    accessTokenExpires: { $gt: new Date() }
  }).populate({ path: 'salaryAssignmentId' });
  if (!offer) throw new ApiError(401, 'This offer link is invalid or has expired');
  return offer;
};

const presentBreakdown = (assignment) => {
  if (!assignment) return null;
  const b = assignment.frozenMonthlyBreakdown;
  const withDisplay = (items) => items.map((i) => ({ ...i.toObject?.() ?? i, display: formatINR(i.monthlyAmount) }));
  return {
    annualCTC: assignment.annualCTC,
    annualCTCDisplay: formatINR(assignment.annualCTC),
    earnings: withDisplay(b.earnings),
    deductions: withDisplay(b.deductions),
    grossEarnings: b.grossEarnings,
    grossEarningsDisplay: formatINR(b.grossEarnings),
    totalDeductions: b.totalDeductions,
    netTakeHome: b.netTakeHome,
    netTakeHomeDisplay: formatINR(b.netTakeHome)
  };
};

/**
 * GET /api/candidate/offer/:token
 * US 5.1 / 5.2 — open the offer portal via magic link and inspect the
 * compensation breakdown without authenticating.
 */
export const getOfferByToken = asyncHandler(async (req, res) => {
  const offer = await findOfferByToken(req.params.token);
  res.status(200).json({
    success: true,
    offer: {
      id: offer._id,
      fullName: offer.fullName,
      candidateEmail: offer.candidateEmail,
      position: offer.position,
      department: offer.department,
      offerDate: offer.offerDate,
      joiningDate: offer.joiningDate,
      status: offer.status,
      pdfFileUrl: offer.pdfFileUrl,
      signedPdfFileUrl: offer.signedPdfFileUrl
    },
    compensation: presentBreakdown(offer.salaryAssignmentId)
  });
});

/**
 * POST /api/candidate/offer/:token/sign
 * US 5.3 — accept the offer by submitting a drawn signature (base64 PNG).
 * Bakes the signature into the PDF, records a cryptographic verification hash,
 * flips the offer to "accepted" (with acceptedAt), then provisions the backing
 * candidate into an active employee — assigning an employee ID and emailing
 * login credentials (US 5.4).
 * Body: { signatureBase64 }
 */
export const signOffer = asyncHandler(async (req, res) => {
  const { signatureBase64 } = req.body;
  const offer = await findOfferByToken(req.params.token);

  if (offer.status === 'accepted') throw new ApiError(409, 'This offer has already been accepted');
  if (offer.status === 'declined') throw new ApiError(409, 'This offer was declined');

  const signedAt = new Date();
  // Cryptographic tamper-evidence hash of the signature + timestamp (CLAUDE.md
  // E-Signature workflow).
  const verificationToken = crypto.createHash('sha256')
    .update(`${signatureBase64}|${signedAt.toISOString()}`).digest('hex');

  const signedPdfFileUrl = await bakeSignatureOnOffer(offer.pdfFileUrl, signatureBase64, {
    name: offer.fullName,
    signedAt
  });

  offer.status = 'accepted';
  offer.acceptedAt = signedAt;
  offer.signedPdfFileUrl = signedPdfFileUrl;
  offer.digitalSignature = { signatureBase64, signedAt, ipAddress: req.ip, verificationToken };
  // Burn the access token so the magic link cannot be replayed.
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
    message: 'Offer accepted and signed',
    signedPdfFileUrl,
    verificationToken,
    employeeId: provisioning?.employeeId || null,
    credentialsEmailedTo: offer.candidateEmail,
    ...(exposeToken() && provisioning ? { tempPassword: provisioning.tempPassword } : {})
  });
});

/**
 * POST /api/candidate/setup-password
 * US 5.4 — register account credentials using the emailed setup token, which
 * activates the employee account.
 * Body: { token, password }
 */
export const setupPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findOne({
    'passwordSetup.tokenHash': hashToken(token),
    'passwordSetup.expiresAt': { $gt: new Date() }
  });
  if (!user) throw new ApiError(401, 'This setup link is invalid or has expired');

  user.password = password; // hashed by pre-save hook
  user.isActive = true;
  user.passwordSetup = { tokenHash: null, expiresAt: null };
  await user.save();

  res.status(200).json({ success: true, message: 'Password set. You can now log in.' });
});
