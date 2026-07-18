import path from 'node:path';
import EmployeeDocument from '../models/EmployeeDocument.js';
import Company from '../models/Company.js';
import { generateAppointmentLetterPdf, GENERATED_DOC_DIR } from './pdfService.js';
import { resolveDefaultLetterTemplate } from '../controllers/letterTemplateController.js';
import { applyLetterText } from '../config/letterFields.js';
import { DEFAULT_LETTER_EMAIL } from '../models/LetterTemplate.js';
import { sendAppointmentLetter } from './emailService.js';
import { queueMailJob } from './mailQueue.js';
import { formatINR } from '../utils/money.js';

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const fullNameOf = (u) =>
  `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email;

/** Harish-style: "9th July 2026" */
const fmtAppointmentDate = (d) => {
  if (!d) return '';
  if (typeof d === 'string' && /[a-zA-Z]/.test(d) && !/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const m = String(d).match(/^(\d{1,2})(st|nd|rd|th)?\s+/i);
    if (m && !m[2]) {
      const n = Number(m[1]);
      const ord = (n % 10 === 1 && n % 100 !== 11) ? 'st'
        : (n % 10 === 2 && n % 100 !== 12) ? 'nd'
          : (n % 10 === 3 && n % 100 !== 13) ? 'rd' : 'th';
      return String(d).replace(/^(\d{1,2})/, `$1${ord}`);
    }
    return String(d);
  }
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  const n = x.getDate();
  const ord = (n % 10 === 1 && n % 100 !== 11) ? 'st'
    : (n % 10 === 2 && n % 100 !== 12) ? 'nd'
      : (n % 10 === 3 && n % 100 !== 13) ? 'rd' : 'th';
  return `${n}${ord} ${MONTHS[x.getMonth() + 1]} ${x.getFullYear()}`;
};

const honorificOf = (user) => {
  const g = String(user?.personalDetails?.gender || '').toLowerCase();
  if (g === 'female') return 'Ms.';
  if (g === 'male') return 'Mr.';
  return '';
};

/** Split address into Harish-style lines (street parts, locality, city + PIN). */
const addressLinesOf = (user) => {
  const a = user.contactInfo?.presentAddress || user.contactInfo?.permanentAddress;
  if (!a) return [];
  const lines = [];
  const street = String(a.street || a.line1 || '').trim();
  if (street.includes('\n')) {
    for (const ln of street.split(/\n+/).map((s) => s.trim()).filter(Boolean)) lines.push(ln);
  } else if (street.includes(',')) {
    // "H.no; 3-3-458/3, Gayathri Nagar" → two lines when useful
    const parts = street.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0].length < 48) {
      lines.push(...parts);
    } else {
      lines.push(street);
    }
  } else if (street) {
    lines.push(street);
  }
  if (a.line2) lines.push(String(a.line2).trim());
  if (a.area || a.locality) lines.push(String(a.area || a.locality).trim());
  const city = String(a.city || '').trim();
  const pin = a.zipCode || a.pincode || a.pin;
  if (city && pin) lines.push(`${city}, PIN Code: ${pin}`);
  else if (city && a.state) lines.push([city, a.state].filter(Boolean).join(', '));
  else if (city) lines.push(city);
  else if (pin) lines.push(`PIN Code: ${pin}`);
  return lines.filter(Boolean);
};

/** Download / email filename like Harish-appointment.pdf */
export const appointmentFileName = (employeeName) => {
  const parts = String(employeeName || 'employee').trim().split(/\s+/).filter(Boolean);
  const key = (parts[0] || 'employee').replace(/[^\w.-]+/g, '') || 'employee';
  return `${key}-appointment.pdf`;
};

/**
 * Build PDF for an appointment letter (Harish layout only).
 * Template bodyParagraphs are used for email only — PDF copy is locked in pdfService.
 */
export const buildAppointmentLetterPdf = async ({
  user,
  company,
  designation,
  effectiveDate,
  department,
  location,
  annualCTCPaisa
}) => {
  const employeeName = fullNameOf(user);
  const firstName = user.personalDetails?.firstName || employeeName.split(/\s+/)[0] || employeeName;
  const desig = designation || user.employeeDetails?.designation || '';
  const effDate = effectiveDate || user.employeeDetails?.dateOfJoining || new Date();
  const joinStr = fmtAppointmentDate(effDate);
  const companyName = company?.name || 'Company';
  const phone = user.contactInfo?.personalMobile || user.contactInfo?.workMobile || '';
  // Only non-empty reporting area is rendered on the PDF ("Your assigned reporting area…").
  const loc = String(location ?? user.employeeDetails?.workLocation ?? '').trim();
  const addressLines = addressLinesOf(user);
  const honorific = honorificOf(user);
  const trainingVenue = 'Vivanta, Begumpet, Hyderabad';
  const joiningTime = '10:00 AM';

  const fields = {
    employeeName,
    firstName,
    Name: employeeName,
    designation: desig,
    Role: desig,
    department: department || user.employeeDetails?.department || '',
    employeeId: user.employeeDetails?.employeeId || '',
    joiningDate: joinStr,
    'Date of joining': joinStr,
    date: joinStr,
    Date: joinStr,
    companyName,
    location: loc,
    Location: loc,
    phone,
    Phone: phone,
    Mobile: phone,
    email: user.email || '',
    addressLine1: addressLines[0] || '',
    Address: addressLines[0] || '',
    addressLine2: addressLines[1] || '',
    addressCityLine: addressLines[addressLines.length - 1] || '',
    ctc: annualCTCPaisa != null ? formatINR(annualCTCPaisa) : '',
    trainingVenue,
    joiningTime
  };

  const letterTpl = await resolveDefaultLetterTemplate('AppointmentLetter');

  const pdfFileUrl = await generateAppointmentLetterPdf({
    company,
    employeeName,
    firstName,
    designation: desig,
    joiningDate: joinStr,
    letterDate: joinStr,
    location: loc,
    addressLines,
    phone,
    trainingVenue,
    joiningTime,
    honorific
  });

  return {
    pdfFileUrl,
    title: 'APPOINTMENT LETTER',
    fields,
    letterTpl,
    employeeName,
    fileName: appointmentFileName(firstName || employeeName)
  };
};

/**
 * Generate Appointment Letter (Harish), persist as EmployeeDocument, email PDF.
 */
export const issueAndEmailAppointmentLetter = async ({
  user,
  issuedBy,
  designation,
  effectiveDate,
  department,
  companyId,
  annualCTCPaisa,
  location,
  queueEmail = true
}) => {
  const company = await Company.findById(companyId || user.companyId);
  const built = await buildAppointmentLetterPdf({
    user,
    company,
    designation,
    effectiveDate,
    department,
    location,
    annualCTCPaisa
  });

  const doc = await EmployeeDocument.create({
    userId: user._id,
    type: 'AppointmentLetter',
    title: built.title,
    inputs: {
      effectiveDate: effectiveDate || user.employeeDetails?.dateOfJoining || new Date(),
      designation: designation || user.employeeDetails?.designation,
      downloadFileName: built.fileName
    },
    pdfFileUrl: built.pdfFileUrl,
    requiresSignature: true,
    issuedBy: issuedBy?._id || issuedBy
  });

  const defaults = DEFAULT_LETTER_EMAIL.AppointmentLetter;
  const subjectTpl = (built.letterTpl?.emailSubject && String(built.letterTpl.emailSubject).trim())
    || defaults.subject;
  const bodyTpl = (built.letterTpl?.emailBody && String(built.letterTpl.emailBody).trim())
    || defaults.body;
  const subject = applyLetterText(subjectTpl, built.fields);
  const body = applyLetterText(bodyTpl, built.fields);

  const absPdf = path.resolve(process.cwd(), built.pdfFileUrl);
  const send = () => sendAppointmentLetter({
    to: user.email,
    subject,
    body,
    pdfPath: absPdf,
    fileName: built.fileName
  });

  const email = queueEmail ? await queueMailJob(send) : await send();

  return {
    document: doc,
    email,
    title: built.title,
    letterTemplateId: built.letterTpl?._id || null,
    fileName: built.fileName,
    pdfFileUrl: built.pdfFileUrl
  };
};

export { GENERATED_DOC_DIR };
