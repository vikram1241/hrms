import mongoose from 'mongoose';

/**
 * Company — the tenant root (Epic T). Every tenant-scoped record references one
 * via `companyId`. `slug` is the tenant resolver used at login (company code)
 * and, later, subdomains.
 *
 * A reserved platform company (slug '_platform') houses the superadmin and is
 * exempt from tenant scoping.
 */
const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },

  // Branding + PDF-sealing assets (Epic C).
  branding: {
    logoUrl: { type: String, default: null },
    /** Company letter header (image or PDF) drawn on every generated letter. */
    letterheadUrl: { type: String, default: null },
    letterheadFileName: { type: String, trim: true },
    /** Shared letter template/outline PDF used for all generated letters when set. */
    letterOutlineUrl: { type: String, default: null },
    letterOutlineFileName: { type: String, trim: true },
    // Pre-saved stamp + authorized-signatory signature baked onto issued PDFs.
    stampUrl: { type: String, default: null },
    signatureUrl: { type: String, default: null },
    authorizedSignatoryName: { type: String, trim: true },
    authorizedSignatoryDesignation: { type: String, trim: true }
  },

  /** HR contact block printed on offer / appointment letters. */
  hr: {
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    contact: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true }
  },

  // Statutory registration numbers (GSTIN / CIN shown in Company Settings).
  statutory: {
    gstin: { type: String, trim: true },
    cin: { type: String, trim: true }
  },

  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
    zipCode: { type: String, trim: true }
  },

  /**
   * Per-tenant SMTP / outbound mail settings. Read from the DB on every send
   * (no process-wide env transporter). Password is never returned by the API.
   */
  mail: {
    smtpHost: { type: String, trim: true, default: 'smtp.gmail.com' },
    smtpPort: { type: Number, default: 465 },
    smtpUser: { type: String, trim: true, default: '' },
    smtpPass: { type: String, default: '' },
    mailFrom: { type: String, trim: true, default: '' }
  },

  contactEmail: { type: String, trim: true, lowercase: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

/** The reserved platform tenant slug (houses superadmins). */
export const PLATFORM_SLUG = '_platform';

/** API-safe company document — SMTP password never leaves the server. */
export const presentCompany = (company) => {
  const o = typeof company.toObject === 'function' ? company.toObject() : { ...company };
  const mail = o.mail || {};
  o.mail = {
    smtpHost: mail.smtpHost || 'smtp.gmail.com',
    smtpPort: mail.smtpPort || 465,
    smtpUser: mail.smtpUser || '',
    mailFrom: mail.mailFrom || '',
    smtpPassSet: Boolean(mail.smtpPass)
  };
  return o;
};

export default mongoose.model('Company', CompanySchema);
