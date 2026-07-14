import Company, { presentCompany } from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Company is the tenant root (not tenant-scoped) — always resolve via the
// caller's own companyId so a tenant can only read/write its own config.
const loadOwnCompany = async (req) => {
  const company = await Company.findById(req.user.companyId);
  if (!company) throw new ApiError(404, 'Company not found');
  return company;
};

/** GET /api/company — the caller's company configuration (Epic C). */
export const getCompany = asyncHandler(async (req, res) => {
  const company = await loadOwnCompany(req);
  res.status(200).json({ success: true, company: presentCompany(company) });
});

/** PUT /api/company — update branding, statutory, address and mail (Epic C). */
export const updateCompany = asyncHandler(async (req, res) => {
  const company = await loadOwnCompany(req);
  const b = req.body;

  if (b.name !== undefined) company.name = b.name;
  if (b.contactEmail !== undefined) company.contactEmail = b.contactEmail;

  if (b.branding) {
    ['authorizedSignatoryName', 'authorizedSignatoryDesignation'].forEach((k) => {
      if (b.branding[k] !== undefined) company.branding[k] = b.branding[k];
    });
  }
  if (b.statutory) {
    ['pfNumber', 'esiNumber', 'ptNumber', 'tan', 'gstin', 'cin'].forEach((k) => {
      if (b.statutory[k] !== undefined) company.statutory[k] = b.statutory[k];
    });
  }
  if (b.address) {
    ['street', 'city', 'state', 'country', 'zipCode'].forEach((k) => {
      if (b.address[k] !== undefined) company.address[k] = b.address[k];
    });
  }
  if (b.mail) {
    if (!company.mail) company.mail = {};
    ['smtpHost', 'smtpUser', 'mailFrom'].forEach((k) => {
      if (b.mail[k] !== undefined) company.mail[k] = b.mail[k];
    });
    if (b.mail.smtpPort !== undefined) {
      const port = Number(b.mail.smtpPort);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new ApiError(400, 'smtpPort must be a number between 1 and 65535');
      }
      company.mail.smtpPort = port;
    }
    // Only overwrite the password when the client sends a non-empty value.
    // Empty / omitted keeps the existing secret (UI uses a blank "leave unchanged" field).
    if (typeof b.mail.smtpPass === 'string' && b.mail.smtpPass.trim()) {
      company.mail.smtpPass = b.mail.smtpPass.trim();
    }
  }

  await company.save();
  res.status(200).json({
    success: true,
    message: 'Company configuration updated',
    company: presentCompany(company)
  });
});

const ASSET_KINDS = { logo: 'logoUrl', letterhead: 'letterheadUrl', stamp: 'stampUrl', signature: 'signatureUrl' };

/**
 * POST /api/company/asset/:kind — upload a branding asset (logo | letterhead |
 * stamp | signature). Stamp + signature are baked onto issued PDFs (Epic 10).
 */
export const uploadCompanyBrandingAsset = asyncHandler(async (req, res) => {
  const field = ASSET_KINDS[req.params.kind];
  if (!field) throw new ApiError(400, `Invalid asset kind. Use one of: ${Object.keys(ASSET_KINDS).join(', ')}`);
  if (!req.file) throw new ApiError(400, 'No image uploaded (field "asset")');

  const company = await loadOwnCompany(req);
  company.branding[field] = `uploads/company/${req.file.filename}`;
  await company.save();

  res.status(200).json({ success: true, message: `${req.params.kind} updated`, url: company.branding[field] });
});
