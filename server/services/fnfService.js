import path from 'node:path';
import { resolveDefaultLetterTemplate } from '../controllers/letterTemplateController.js';
import { generateLetterFromTemplate } from './pdfService.js';
import { DEFAULT_LETTER_EMAIL } from '../models/LetterTemplate.js';
import { applyLetterText } from '../config/letterFields.js';
import { formatINR } from '../utils/money.js';
import { sendAppointmentLetter } from './emailService.js';
import { queueMailJob } from './mailQueue.js';

/**
 * Generate an FNFLetter (if a default template exists) and email it to the
 * employee. Returns the generated PDF relative path when created, otherwise null.
 */
export const generateAndEmailFNF = async ({ record, user, company, actor } = {}) => {
  const tpl = await resolveDefaultLetterTemplate('FNFLetter');
  if (!tpl) return null;

  const name = `${user.personalDetails?.firstName || ''} ${user.personalDetails?.lastName || ''}`.trim();
  const lwd = new Date(record.lastWorkingDay).toDateString();
  const amountPaisa = Number(record?.fnfSettlement?.amount ?? 0) || 0;
  const fields = {
    employeeName: name,
    employeeId: user.employeeDetails?.employeeId || '',
    designation: user.employeeDetails?.designation || 'Employee',
    companyName: company?.name || 'Company',
    amount: formatINR(amountPaisa),
    Amount: formatINR(amountPaisa),
    reason: record?.reason || 'Resignation',
    Reason: record?.reason || 'Resignation',
    lastWorkingDay: lwd,
    date: record.lastWorkingDay
  };

  const pdf = await generateLetterFromTemplate({ template: tpl, fields, company });
  const absPdf = path.resolve(process.cwd(), pdf);

  const defaults = DEFAULT_LETTER_EMAIL.FNFLetter || {};
  const subjectTpl = (tpl?.emailSubject && String(tpl.emailSubject).trim()) || defaults.subject || '';
  const bodyTpl = (tpl?.emailBody && String(tpl.emailBody).trim()) || defaults.body || '';
  const subject = applyLetterText(subjectTpl, fields);
  const body = applyLetterText(bodyTpl, fields);

  const send = () => sendAppointmentLetter({ to: user.email, subject, body, pdfPath: absPdf, fileName: `${name}-fnf.pdf` });
  await queueMailJob(send);
  return pdf;
};

export default { generateAndEmailFNF };
