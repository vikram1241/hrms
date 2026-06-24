import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const STAGES = ['personal', 'family', 'contact', 'bank', 'completed'];

// Advance the stored stage forward only (never regress on a re-save).
const advanceStage = (user, justCompleted) => {
  const next = STAGES[STAGES.indexOf(justCompleted) + 1] || 'completed';
  if (STAGES.indexOf(next) > STAGES.indexOf(user.onboardingStage)) {
    user.onboardingStage = next;
  }
};

const loadSelf = async (req) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

/**
 * GET /api/onboarding/status — US 6.3
 * Returns the wizard stage plus per-section completeness and a document summary.
 */
export const getOnboardingStatus = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  const docs = user.uploadedDocuments || [];
  res.status(200).json({
    success: true,
    stage: user.onboardingStage,
    sections: {
      personal: Boolean(user.personalDetails?.firstName && user.personalDetails?.dateOfBirth),
      family: (user.familyDetails || []).length > 0,
      contact: user.contactInfo?.personalMobile && user.contactInfo.personalMobile !== '0000000000',
      bank: Boolean(user.employeeDetails?.bankDetails?.accountNumber)
    },
    documents: {
      total: docs.length,
      pending: docs.filter((d) => d.verificationStatus === 'Pending').length,
      verified: docs.filter((d) => d.verificationStatus === 'Verified').length,
      rejected: docs.filter((d) => d.verificationStatus === 'Rejected').length
    }
  });
});

/** PATCH /api/onboarding/personal — wizard step 1. */
export const savePersonal = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  const fields = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'bloodGroup', 'maritalStatus'];
  fields.forEach((f) => { if (req.body[f] !== undefined) user.personalDetails[f] = req.body[f]; });
  advanceStage(user, 'personal');
  await user.save();
  res.status(200).json({ success: true, message: 'Personal details saved', stage: user.onboardingStage, personalDetails: user.personalDetails });
});

/** PATCH /api/onboarding/family — wizard step 2 (replaces the family list). */
export const saveFamily = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  if (!Array.isArray(req.body.familyDetails)) throw new ApiError(400, 'familyDetails must be an array');
  user.familyDetails = req.body.familyDetails;
  advanceStage(user, 'family');
  await user.save();
  res.status(200).json({ success: true, message: 'Family details saved', stage: user.onboardingStage, familyDetails: user.familyDetails });
});

/** PATCH /api/onboarding/contact — wizard step 3. */
export const saveContact = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  const c = req.body;
  ['personalMobile', 'workMobile', 'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone']
    .forEach((f) => { if (c[f] !== undefined) user.contactInfo[f] = c[f]; });
  if (c.presentAddress) user.contactInfo.presentAddress = c.presentAddress;
  // US 7 wireframe: "Permanent same as present" checkbox.
  user.contactInfo.permanentAddress = c.sameAsPresent ? c.presentAddress : (c.permanentAddress || user.contactInfo.permanentAddress);
  advanceStage(user, 'contact');
  await user.save();
  res.status(200).json({ success: true, message: 'Contact details saved', stage: user.onboardingStage, contactInfo: user.contactInfo });
});

/** PATCH /api/onboarding/bank — wizard step 4 (final). */
export const saveBank = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  const b = req.body;
  user.employeeDetails = user.employeeDetails || {};
  user.employeeDetails.bankDetails = {
    accountHolderName: b.accountHolderName,
    accountNumber: b.accountNumber,
    bankName: b.bankName,
    ifscCode: b.ifscCode
  };
  if (b.panNumber !== undefined) user.employeeDetails.panNumber = b.panNumber;
  if (b.uanNumber !== undefined) user.employeeDetails.uanNumber = b.uanNumber;
  advanceStage(user, 'bank');
  await user.save();
  res.status(200).json({ success: true, message: 'Bank details saved', stage: user.onboardingStage, bankDetails: user.employeeDetails.bankDetails });
});
