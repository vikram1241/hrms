import crypto from 'node:crypto';
import User from '../models/User.js';
import { sendCredentials } from './emailService.js';
import { clientOrigin } from '../utils/clientOrigin.js';

/**
 * Generate the next available employee id (EMP#####), guaranteed unique.
 * Seeds from the count of existing ids and increments past any collision.
 */
export const generateEmployeeId = async () => {
  let n = 45872 + await User.countDocuments({ 'employeeDetails.employeeId': { $ne: null } });
  let id = `EMP${n}`;
  // eslint-disable-next-line no-await-in-loop
  while (await User.exists({ 'employeeDetails.employeeId': id })) { n += 1; id = `EMP${n}`; }
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
