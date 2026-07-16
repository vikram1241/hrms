import path from 'node:path';
import EmployeeDocument from '../models/EmployeeDocument.js';
import Company from '../models/Company.js';
import { generateCompanyDocPdf, generateLetterFromTemplate, GENERATED_DOC_DIR } from './pdfService.js';
import { resolveDefaultLetterTemplate } from '../controllers/letterTemplateController.js';
import { applyLetterText } from '../config/letterFields.js';
import { DEFAULT_LETTER_EMAIL } from '../models/LetterTemplate.js';
import { sendAppointmentLetter } from './emailService.js';
import { formatINR } from '../utils/money.js';

const fullNameOf = (u) =>
  `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email;

const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Generate an Appointment Letter from the default Letter Template (Template Setup),
 * persist as EmployeeDocument, and email the PDF to the employee.
 */
export const issueAndEmailAppointmentLetter = async ({
  user,
  issuedBy,
  designation,
  effectiveDate,
  department,
  companyId,
  annualCTCPaisa
}) => {
  const company = await Company.findById(companyId || user.companyId);
  const employeeName = fullNameOf(user);
  const desig = designation || user.employeeDetails?.designation || '';
  const effDate = effectiveDate || user.employeeDetails?.dateOfJoining || new Date();
  const companyName = company?.name || 'Company';

  const fallbackTitle = 'Letter of Appointment';
  const fallbackParagraphs = [
    `This letter confirms your appointment as ${desig || 'an employee'} at ${companyName}, effective ${new Date(effDate).toDateString()}.`,
    `Your employment is governed by the terms of your offer letter, the employee handbook, and the company's policies as amended from time to time.`,
    `Please sign below to accept this appointment.`
  ];

  const letterTpl = await resolveDefaultLetterTemplate('AppointmentLetter');
  let pdfFileUrl;
  let title = fallbackTitle;

  const fields = {
    employeeName,
    designation: desig,
    department: department || user.employeeDetails?.department || '',
    employeeId: user.employeeDetails?.employeeId || '',
    joiningDate: fmtDate(effDate),
    date: fmtDate(effDate),
    companyName,
    ctc: annualCTCPaisa != null ? formatINR(annualCTCPaisa) : '',
    offerUrl: '',
    lastWorkingDay: '',
    location: user.employeeDetails?.workLocation || ''
  };

  if (letterTpl) {
    title = letterTpl.title || letterTpl.name || fallbackTitle;
    pdfFileUrl = await generateLetterFromTemplate({
      template: letterTpl,
      fields,
      company,
      destDir: GENERATED_DOC_DIR
    });
  }

  if (!pdfFileUrl) {
    pdfFileUrl = await generateCompanyDocPdf({
      title: fallbackTitle,
      paragraphs: fallbackParagraphs,
      company,
      employeeName,
      designation: desig,
      effectiveDate: effDate
    });
  }

  const doc = await EmployeeDocument.create({
    userId: user._id,
    type: 'AppointmentLetter',
    title,
    inputs: { effectiveDate: effDate, designation: desig },
    pdfFileUrl,
    requiresSignature: true,
    issuedBy: issuedBy?._id || issuedBy
  });

  const defaults = DEFAULT_LETTER_EMAIL.AppointmentLetter;
  const subjectTpl = (letterTpl?.emailSubject && String(letterTpl.emailSubject).trim())
    || defaults.subject;
  const bodyTpl = (letterTpl?.emailBody && String(letterTpl.emailBody).trim())
    || defaults.body;
  const subject = applyLetterText(subjectTpl, fields);
  const body = applyLetterText(bodyTpl, fields);

  const absPdf = path.resolve(process.cwd(), pdfFileUrl);
  const safeName = String(employeeName || 'employee').replace(/[^\w.-]+/g, '-');
  const email = await sendAppointmentLetter({
    to: user.email,
    subject,
    body,
    pdfPath: absPdf,
    fileName: `appointment-letter-${safeName}.pdf`
  });

  return { document: doc, email, title, letterTemplateId: letterTpl?._id || null };
};
