import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

// Company branding assets (logo / letterhead / stamp / signature). Served via an
// authorized route, not the public static dir — they seal official PDFs.
export const COMPANY_ASSET_DIR = path.resolve('uploads', 'company');
fs.mkdirSync(COMPANY_ASSET_DIR, { recursive: true });

const ALLOWED_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png']
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, COMPANY_ASSET_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME.get(file.mimetype) || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) return cb(new ApiError(400, 'Asset must be a JPEG or PNG image'));
  cb(null, true);
};

/** Single-file company asset upload (field name "asset"), max 3MB, JPEG/PNG. */
export const uploadCompanyAsset = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 }
}).single('asset');
