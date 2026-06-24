/**
 * Transactional email service.
 *
 * This is a STUB: it logs to the console and records every message in an
 * in-memory outbox so tests can assert on what would have been sent. Swap the
 * `transport` for Nodemailer/SES/etc. in production without touching callers.
 */

const outbox = [];

const transport = async (message) => {
  outbox.push({ ...message, sentAt: new Date() });
  if (process.env.NODE_ENV !== 'test') {
    console.log(`📧 [email] to=${message.to} subject="${message.subject}"`);
  }
};

export const sendEmail = ({ to, subject, body, meta = {} }) =>
  transport({ to, subject, body, meta });

/** Offer invitation carrying the candidate magic-link (US 5.1). */
export const sendOfferInvite = ({ to, fullName, offerUrl }) =>
  sendEmail({
    to,
    subject: 'Your employment offer from XYZ Software Solutions',
    body: `Hi ${fullName}, view and sign your offer here: ${offerUrl}`,
    meta: { type: 'offer_invite', offerUrl }
  });

/** Credential-setup link issued after offer acceptance (US 5.4). */
export const sendPasswordSetup = ({ to, fullName, setupUrl }) =>
  sendEmail({
    to,
    subject: 'Set up your XYZ employee account',
    body: `Welcome aboard ${fullName}! Set your password here: ${setupUrl}`,
    meta: { type: 'password_setup', setupUrl }
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
