import nodemailer from 'nodemailer';
import Company from '../models/Company.js';
import { currentCompanyId } from '../utils/tenantContext.js';

/**
 * Transactional email service.
 *
 * SMTP credentials are stored per-company in the database (Company.mail) and
 * loaded on every send from the active tenant context. When NODE_ENV is "test"
 * or the company has no SMTP user/password, messages fall back to a console
 * stub + in-memory outbox (used by tests). Every message is recorded in the
 * outbox regardless.
 */

const outbox = [];

const loadCompanyMail = async () => {
  if (process.env.NODE_ENV === 'test') return { brandName: 'mirus', transport: null, from: null };

  const companyId = currentCompanyId();
  if (!companyId) {
    console.warn('[email] No tenant companyId in context — stubbing send.');
    return { brandName: 'mirus', transport: null, from: null };
  }

  const company = await Company.findById(companyId).select('name mail contactEmail').lean();
  if (!company) {
    console.warn(`[email] Company ${companyId} not found — stubbing send.`);
    return { brandName: 'mirus', transport: null, from: null };
  }

  const mail = company.mail || {};
  const brandName = company.name || 'HRMS';

  if (!mail.smtpUser || !mail.smtpPass) {
    console.warn(`[email] SMTP not configured for company "${brandName}" — stubbing send.`);
    return { brandName, transport: null, from: null };
  }

  const port = Number(mail.smtpPort) || 465;
  const user = String(mail.smtpUser).trim();
  const pass = String(mail.smtpPass).replace(/\s+/g, '');
  const from = (mail.mailFrom && String(mail.mailFrom).trim())
    || `${brandName} <${user}>`;

  return {
    brandName,
    from,
    transport: nodemailer.createTransport({
      host: (mail.smtpHost && String(mail.smtpHost).trim()) || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user, pass }
    })
  };
};

const wrapHtml = (body, brandName) =>
  `<div style="font-family:Inter,Arial,sans-serif;color:#2D2D2D;line-height:1.6">
     <div style="background:#E89000;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:700">${brandName}</div>
     <div style="border:1px solid #E0E0E0;border-top:0;padding:20px;border-radius:0 0 8px 8px">${body}</div>
   </div>`;

const deliver = async ({ to, subject, body, html, meta = {}, cfg, attachments }) => {
  outbox.push({ to, subject, body, meta, sentAt: new Date(), attachmentCount: attachments?.length || 0 });
  const brandName = cfg?.brandName || 'mirus';

  if (!cfg?.transport) {
    if (process.env.NODE_ENV !== 'test') console.log(`[email stub] to=${to} subject="${subject}"`);
    return { delivered: false, mode: 'stub', brandName };
  }

  try {
    const info = await cfg.transport.sendMail({
      from: cfg.from,
      to,
      subject,
      text: body,
      html: html || wrapHtml(body, brandName),
      attachments: attachments?.length ? attachments : undefined
    });
    return { delivered: true, mode: 'smtp', id: info.messageId, brandName };
  } catch (err) {
    console.error(`[email failed] to=${to}: ${err.message}`);
    return { delivered: false, mode: 'smtp', error: err.message, brandName };
  }
};

export const sendEmail = async ({ to, subject, body, html, meta = {}, attachments } = {}) => {
  const cfg = await loadCompanyMail();
  return deliver({ to, subject, body, html, meta, cfg, attachments });
};

export const sendOfferInvite = async ({ to, fullName, offerUrl }) => {
  const cfg = await loadCompanyMail();
  const brand = cfg.brandName;
  return deliver({
    to,
    subject: `Your employment offer from ${brand}`,
    body: `Hi ${fullName}, view and sign your offer here: ${offerUrl}`,
    html: wrapHtml(`<p>Hi <strong>${fullName}</strong>,</p><p><a href="${offerUrl}">View &amp; Sign Offer</a></p>`, brand),
    meta: { type: 'offer_invite', offerUrl },
    cfg
  });
};

export const sendPasswordSetup = async ({ to, fullName, setupUrl }) => {
  const cfg = await loadCompanyMail();
  const brand = cfg.brandName;
  return deliver({
    to,
    subject: `Set up your ${brand} employee account`,
    body: `Welcome aboard ${fullName}! Set your password here: ${setupUrl}`,
    meta: { type: 'password_setup', setupUrl },
    cfg
  });
};

export const sendCredentials = async ({ to, fullName, employeeId, email, tempPassword, loginUrl }) => {
  const cfg = await loadCompanyMail();
  const brand = cfg.brandName;
  return deliver({
    to,
    subject: `Your ${brand} employee account is ready`,
    body: `Hi ${fullName}, Employee ID: ${employeeId}. Login: ${email} at ${loginUrl}`,
    meta: { type: 'credentials', employeeId },
    cfg
  });
};

export const sendPayslipNotice = ({ to, fullName, period }) =>
  sendEmail({
    to,
    subject: `Your payslip for ${period}`,
    body: `Hi ${fullName}, your payslip for ${period} is available in the portal.`,
    meta: { type: 'payslip_notice', period }
  });

/** Email a generated C&F agreement PDF to the partner. */
export const sendCFAgreement = async ({ to, partyName, typeLabel, brandName, pdfPath, fileName }) => {
  const cfg = await loadCompanyMail();
  const brand = brandName || cfg.brandName;
  const label = typeLabel || 'C&F Agreement';
  const who = partyName || 'Partner';
  return deliver({
    to,
    subject: `${label} from ${brand}`,
    body: `Dear ${who},\n\nPlease find attached your ${label} from ${brand}.\n\nRegards,\n${brand}`,
    html: wrapHtml(
      `<p>Dear <strong>${who}</strong>,</p>
       <p>Please find attached your <strong>${label}</strong> from ${brand}.</p>
       <p>Regards,<br/>${brand}</p>`,
      brand
    ),
    meta: { type: 'cf_agreement', typeLabel: label },
    cfg,
    attachments: [{
      filename: fileName || 'cf-agreement.pdf',
      path: pdfPath,
      contentType: 'application/pdf'
    }]
  });
};

export const getOutbox = () => [...outbox];
export const clearOutbox = () => { outbox.length = 0; };
