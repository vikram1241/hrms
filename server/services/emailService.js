import nodemailer from 'nodemailer';

/**
 * Transactional email service.
 *
 * Uses SMTP only when SMTP_USER + SMTP_PASS are set in the environment AND
 * NODE_ENV is not "test". Otherwise falls back to a console stub + in-memory
 * outbox (used by tests). Every message is recorded in the outbox regardless.
 */

const outbox = [];
let transporter;

const initTransport = () => {
  if (transporter !== undefined) return transporter;

  if (process.env.NODE_ENV === 'test') {
    transporter = false;
    return transporter;
  }

  const { SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT } = process.env;

  if (SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: SMTP_USER.trim(), pass: SMTP_PASS.replace(/\s+/g, '') }
    });
    console.log(`Email transport ready (SMTP ${SMTP_HOST || 'smtp.gmail.com'}:${port})`);
  } else {
    transporter = false;
    console.warn('SMTP not configured — emails will be logged only.');
  }
  return transporter;
};

const fromAddress = () => process.env.MAIL_FROM || `mirus <${process.env.SMTP_USER || 'no-reply@mirus.local'}>`;

const wrapHtml = (body) =>
  `<div style="font-family:Inter,Arial,sans-serif;color:#2D2D2D;line-height:1.6">
     <div style="background:#E89000;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:700">Mirus Med Sciences</div>
     <div style="border:1px solid #E0E0E0;border-top:0;padding:20px;border-radius:0 0 8px 8px">${body}</div>
   </div>`;

export const sendEmail = async ({ to, subject, body, html, meta = {} }) => {
  outbox.push({ to, subject, body, meta, sentAt: new Date() });

  const t = initTransport();
  if (!t) {
    if (process.env.NODE_ENV !== 'test') console.log(`[email stub] to=${to} subject="${subject}"`);
    return { delivered: false, mode: 'stub' };
  }

  try {
    const info = await t.sendMail({ from: fromAddress(), to, subject, text: body, html: html || wrapHtml(body) });
    return { delivered: true, mode: 'smtp', id: info.messageId };
  } catch (err) {
    console.error(`[email failed] to=${to}: ${err.message}`);
    return { delivered: false, mode: 'smtp', error: err.message };
  }
};

export const sendOfferInvite = ({ to, fullName, offerUrl }) =>
  sendEmail({
    to,
    subject: 'Your employment offer from Mirus Med Sciences',
    body: `Hi ${fullName}, view and sign your offer here: ${offerUrl}`,
    html: wrapHtml(`<p>Hi <strong>${fullName}</strong>,</p><p><a href="${offerUrl}">View &amp; Sign Offer</a></p>`),
    meta: { type: 'offer_invite', offerUrl }
  });

export const sendPasswordSetup = ({ to, fullName, setupUrl }) =>
  sendEmail({
    to,
    subject: 'Set up your mirus employee account',
    body: `Welcome aboard ${fullName}! Set your password here: ${setupUrl}`,
    meta: { type: 'password_setup', setupUrl }
  });

export const sendCredentials = ({ to, fullName, employeeId, email, tempPassword, loginUrl }) =>
  sendEmail({
    to,
    subject: 'Your mirus employee account is ready',
    body: `Hi ${fullName}, Employee ID: ${employeeId}. Login: ${email} at ${loginUrl}`,
    meta: { type: 'credentials', employeeId }
  });

export const sendPayslipNotice = ({ to, fullName, period }) =>
  sendEmail({
    to,
    subject: `Your payslip for ${period}`,
    body: `Hi ${fullName}, your payslip for ${period} is available in the portal.`,
    meta: { type: 'payslip_notice', period }
  });

export const getOutbox = () => [...outbox];
export const clearOutbox = () => { outbox.length = 0; };
