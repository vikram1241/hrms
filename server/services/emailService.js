import nodemailer from 'nodemailer';

/**
 * Transactional email service.
 *
 * If SMTP credentials (SMTP_USER + SMTP_PASS) are present in the environment,
 * email is sent for real via Nodemailer. Otherwise it falls back to a STUB
 * that logs to the console and records messages in an in-memory outbox (used
 * by tests). Every message is recorded in the outbox regardless of mode.
 *
 * Gmail note: SMTP_PASS must be a 16-char *App Password* (Google Account →
 * Security → 2-Step Verification → App passwords), NOT your account password.
 */

const outbox = [];
let transporter; // undefined = not yet initialized; false = stub mode

const initTransport = () => {
  if (transporter !== undefined) return transporter;
  const { SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT } = process.env;

  if (SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      // Gmail shows app passwords in 4x4 groups; strip spaces so either form works.
      auth: { user: SMTP_USER.trim(), pass: SMTP_PASS.replace(/\s+/g, '') }
    });
    console.log(`📧 Email transport ready (SMTP ${SMTP_HOST || 'smtp.gmail.com'}:${port} as ${SMTP_USER})`);
  } else {
    transporter = false;
    if (process.env.NODE_ENV !== 'test') {
      console.warn('⚠️  SMTP not configured — emails will be logged only. Set SMTP_USER and SMTP_PASS in .env to send for real.');
    }
  }
  return transporter;
};

const fromAddress = () => process.env.MAIL_FROM || `XYZ HRMS <${process.env.SMTP_USER || 'no-reply@xyz.local'}>`;

const wrapHtml = (body) =>
  `<div style="font-family:Inter,Arial,sans-serif;color:#1F2937;line-height:1.6">
     <div style="background:#EA580C;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:700">XYZ Software Solutions</div>
     <div style="border:1px solid #E5E7EB;border-top:0;padding:20px;border-radius:0 0 8px 8px">${body}</div>
   </div>`;

/**
 * Send an email. Never throws — on failure it logs and returns a result object
 * so callers (offer creation, etc.) are not blocked by mail delivery issues.
 * @returns {Promise<{delivered:boolean, mode:string, id?:string, error?:string}>}
 */
export const sendEmail = async ({ to, subject, body, html, meta = {} }) => {
  outbox.push({ to, subject, body, meta, sentAt: new Date() });

  const t = initTransport();
  if (!t) {
    if (process.env.NODE_ENV !== 'test') console.log(`📧 [stub] to=${to} subject="${subject}"`);
    return { delivered: false, mode: 'stub' };
  }

  try {
    const info = await t.sendMail({ from: fromAddress(), to, subject, text: body, html: html || wrapHtml(body) });
    console.log(`📧 [sent] to=${to} subject="${subject}" id=${info.messageId}`);
    return { delivered: true, mode: 'smtp', id: info.messageId };
  } catch (err) {
    console.error(`❌ [email failed] to=${to} subject="${subject}": ${err.message}`);
    return { delivered: false, mode: 'smtp', error: err.message };
  }
};

/** Offer invitation carrying the candidate magic-link (US 5.1). */
export const sendOfferInvite = ({ to, fullName, offerUrl }) =>
  sendEmail({
    to,
    subject: 'Your employment offer from XYZ Software Solutions',
    body: `Hi ${fullName}, view and sign your offer here: ${offerUrl}`,
    html: wrapHtml(`<p>Hi <strong>${fullName}</strong>,</p>
      <p>We're delighted to extend you an offer. Review and sign it securely using the button below.</p>
      <p style="margin:24px 0"><a href="${offerUrl}" style="background:#EA580C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">View &amp; Sign Offer</a></p>
      <p style="font-size:12px;color:#6B7280">Or paste this link into your browser:<br/>${offerUrl}</p>`),
    meta: { type: 'offer_invite', offerUrl }
  });

/** Credential-setup link issued after offer acceptance (US 5.4). */
export const sendPasswordSetup = ({ to, fullName, setupUrl }) =>
  sendEmail({
    to,
    subject: 'Set up your XYZ employee account',
    body: `Welcome aboard ${fullName}! Set your password here: ${setupUrl}`,
    html: wrapHtml(`<p>Welcome aboard, <strong>${fullName}</strong>! 🎉</p>
      <p>Set up your account password to access the employee portal.</p>
      <p style="margin:24px 0"><a href="${setupUrl}" style="background:#EA580C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Set up my account</a></p>
      <p style="font-size:12px;color:#6B7280">${setupUrl}</p>`),
    meta: { type: 'password_setup', setupUrl }
  });

/** Login credentials issued after offer acceptance / by an admin. */
export const sendCredentials = ({ to, fullName, employeeId, email, tempPassword, loginUrl }) =>
  sendEmail({
    to,
    subject: 'Your XYZ employee account is ready',
    body: `Hi ${fullName}, your account is active. Employee ID: ${employeeId}. Login: ${email} / ${tempPassword} at ${loginUrl}. Please change your password after first login.`,
    html: wrapHtml(`<p>Hi <strong>${fullName}</strong>,</p>
      <p>Your employee account is now active. Use the credentials below to sign in, then change your password from your profile.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px;color:#6B7280">Employee ID</td><td style="padding:4px 12px;font-weight:600">${employeeId}</td></tr>
        <tr><td style="padding:4px 12px;color:#6B7280">Email</td><td style="padding:4px 12px;font-weight:600">${email}</td></tr>
        <tr><td style="padding:4px 12px;color:#6B7280">Temporary password</td><td style="padding:4px 12px;font-weight:600">${tempPassword}</td></tr>
      </table>
      <p style="margin:24px 0"><a href="${loginUrl}" style="background:#EA580C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>`),
    meta: { type: 'credentials', employeeId }
  });

/** Payslip notification (US 4.2 / 7). */
export const sendPayslipNotice = ({ to, fullName, period }) =>
  sendEmail({
    to,
    subject: `Your payslip for ${period}`,
    body: `Hi ${fullName}, your payslip for ${period} is available in the portal.`,
    meta: { type: 'payslip_notice', period }
  });

// Test helpers.
export const getOutbox = () => [...outbox];
export const clearOutbox = () => { outbox.length = 0; };
