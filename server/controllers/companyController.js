import fs from 'node:fs';
import path from 'node:path';
import Company, { presentCompany } from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { COMPANY_ASSET_DIR } from '../middleware/uploadCompanyAsset.js';

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

/** PUT /api/company — update branding, HR, statutory, address and mail (Epic C). */
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
  if (b.hr) {
    if (!company.hr) company.hr = {};
    ['name', 'designation', 'contact', 'email'].forEach((k) => {
      if (b.hr[k] !== undefined) company.hr[k] = b.hr[k];
    });
  }
  if (b.statutory) {
    ['gstin', 'cin'].forEach((k) => {
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

const ASSET_KINDS = {
  logo: { url: 'logoUrl' },
  letterhead: { url: 'letterheadUrl', fileName: 'letterheadFileName' },
  letterOutline: { url: 'letterOutlineUrl', fileName: 'letterOutlineFileName' },
  stamp: { url: 'stampUrl' },
  logoWithStamp: { url: 'logoWithStampUrl' },
  signature: { url: 'signatureUrl' }
};

/**
 * POST /api/company/asset/:kind — upload a branding asset
 * (logo | letterhead | letterOutline | stamp | logoWithStamp | signature).
 */
export const uploadCompanyBrandingAsset = asyncHandler(async (req, res) => {
  const meta = ASSET_KINDS[req.params.kind];
  if (!meta) throw new ApiError(400, `Invalid asset kind. Use one of: ${Object.keys(ASSET_KINDS).join(', ')}`);
  if (!req.file) throw new ApiError(400, 'No file uploaded (field "asset")');

  const company = await loadOwnCompany(req);
  if (!company.branding) company.branding = {};
  company.branding[meta.url] = `uploads/company/${req.file.filename}`;
  if (meta.fileName) company.branding[meta.fileName] = req.file.originalname;
  await company.save();

  res.status(200).json({
    success: true,
    message: `${req.params.kind} updated`,
    url: company.branding[meta.url],
    fileName: meta.fileName ? company.branding[meta.fileName] : undefined
  });
});

/**
 * GET /api/company/asset/:kind — stream a branding asset for preview (auth required).
 */
export const getCompanyBrandingAsset = asyncHandler(async (req, res) => {
  const meta = ASSET_KINDS[req.params.kind];
  if (!meta) throw new ApiError(400, `Invalid asset kind. Use one of: ${Object.keys(ASSET_KINDS).join(', ')}`);

  const company = await loadOwnCompany(req);
  const rel = company.branding?.[meta.url];
  if (!rel) throw new ApiError(404, `No ${req.params.kind} uploaded`);

  const abs = path.resolve(rel);
  if (!abs.startsWith(COMPANY_ASSET_DIR) || !fs.existsSync(abs)) {
    throw new ApiError(404, `${req.params.kind} file missing on disk`);
  }

  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.pdf' ? 'application/pdf'
        : 'application/octet-stream';
  const downloadName = (meta.fileName && company.branding[meta.fileName])
    || path.basename(abs);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${String(downloadName).replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=60');
  fs.createReadStream(abs).pipe(res);
});
