import crypto from 'node:crypto';
import User from '../models/User.js';
import { sendCredentials } from './emailService.js';
import { clientOrigin } from '../utils/clientOrigin.js';

/** Mirus Med Sciences short prefix for employee codes. */
export const EMPLOYEE_ID_PREFIX = (process.env.EMPLOYEE_ID_PREFIX || 'MMS').toUpperCase();

/**
 * Next numeric suffix: max among existing MMS##### (or configured prefix) + 1.
 * Falls back to 45872 when none exist yet (preserves historical sequence).
 */
const nextEmployeeIdNumber = async () => {
  const prefix = EMPLOYEE_ID_PREFIX;
  const re = new RegExp(`^${prefix}(\\d+)$`, 'i');
  const users = await User.find(
    { 'employeeDetails.employeeId': { $regex: re } },
    { 'employeeDetails.employeeId': 1 }
  ).lean();

  let max = 45871; // so first id is …45872 when none exist
  for (const u of users) {
    const m = String(u.employeeDetails?.employeeId || '').match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
};

/**
 * Generate the next available employee id (MMS#####), guaranteed unique.
 * Prefix defaults to MMS (Mirus Med Sciences); override with EMPLOYEE_ID_PREFIX.
 */
export const generateEmployeeId = async () => {
  const prefix = EMPLOYEE_ID_PREFIX;
  let n = await nextEmployeeIdNumber();
  let id = `${prefix}${n}`;
  // eslint-disable-next-line no-await-in-loop
  while (await User.exists({ 'employeeDetails.employeeId': id })) {
    n += 1;
    id = `${prefix}${n}`;
  }
  return id;
};

/** A readable temporary password that satisfies the password policy (letter + digit, ≥8). */
export const generateTempPassword = () => `Hrms@${crypto.randomBytes(4).toString('hex')}`;

/**
 * Provision an accepted candidate into an active employee and issue login
 * credentials, emailing them. Idempotent on employeeId (kept if already set).
 *
 * @param {import('mongoose').Document} user
 * @param {{ offer?: object }} opts  optional offer to copy designation/department/joining from
 * @returns {Promise<{ employeeId: string, tempPassword: string }>}
 */
export const provisionEmployee = async (user, { offer } = {}) => {
  if (!user.employeeDetails) user.employeeDetails = {};
  if (!user.employeeDetails.employeeId) {
    user.employeeDetails.employeeId = await generateEmployeeId();
  }
  if (offer) {
    user.employeeDetails.designation = offer.position;
    user.employeeDetails.department = offer.department;
    user.employeeDetails.dateOfJoining = offer.joiningDate;
  }

  user.isActive = true;
  const tempPassword = generateTempPassword();
  user.password = tempPassword; // hashed by the pre-save hook
  user.passwordSetup = { tokenHash: null, expiresAt: null };
  await user.save();

  const fullName = `${user.personalDetails.firstName} ${user.personalDetails.lastName}`.trim();
  await sendCredentials({
    to: user.email,
    fullName,
    employeeId: user.employeeDetails.employeeId,
    email: user.email,
    tempPassword,
    loginUrl: `${clientOrigin()}/login`
  });

  return { employeeId: user.employeeDetails.employeeId, tempPassword };
};
