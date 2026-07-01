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
    letterheadUrl: { type: String, default: null },
    // Pre-saved stamp + authorized-signatory signature baked onto issued PDFs.
    stampUrl: { type: String, default: null },
    signatureUrl: { type: String, default: null },
    authorizedSignatoryName: { type: String, trim: true },
    authorizedSignatoryDesignation: { type: String, trim: true }
  },

  // Statutory registration numbers used on payslips / statutory registers (Epic C/16).
  statutory: {
    pfNumber: { type: String, trim: true },
    esiNumber: { type: String, trim: true },
    ptNumber: { type: String, trim: true },
    tan: { type: String, trim: true },
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

  contactEmail: { type: String, trim: true, lowercase: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

/** The reserved platform tenant slug (houses superadmins). */
export const PLATFORM_SLUG = '_platform';

export default mongoose.model('Company', CompanySchema);
