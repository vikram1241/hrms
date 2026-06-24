import crypto from 'node:crypto';
import User from '../models/User.js';

const splitName = (fullName) => {
  const parts = String(fullName).trim().split(/\s+/);
  const firstName = parts.shift() || 'Candidate';
  const lastName = parts.join(' ') || '-';
  return { firstName, lastName };
};

/**
 * Find or lazily create the User record that backs a candidate (lifecycle
 * "Draft" state). Schema-required fields we don't yet know are seeded with
 * clearly-marked placeholders; the candidate overwrites them during onboarding
 * (Epic 6) after setting their password (US 5.4). The account is inactive and
 * has an unguessable random password so it cannot be logged into until setup.
 */
export const upsertCandidateUser = async ({ email, fullName }) => {
  const normalized = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: normalized });
  if (existing) return existing;

  const { firstName, lastName } = splitName(fullName);
  const placeholderAddress = { street: 'Pending', city: 'Pending', state: 'Pending', country: 'India', zipCode: '000000' };

  return User.create({
    email: normalized,
    password: crypto.randomBytes(24).toString('hex'),
    role: 'employee',
    isActive: false,
    onboardingStage: 'personal',
    personalDetails: { firstName, lastName, dateOfBirth: new Date('1970-01-01'), gender: 'Prefer not to say' },
    contactInfo: {
      personalMobile: '0000000000',
      emergencyContactName: 'Pending',
      emergencyContactRelation: 'Pending',
      emergencyContactPhone: '0000000000',
      presentAddress: { ...placeholderAddress },
      permanentAddress: { ...placeholderAddress }
    }
  });
};
