import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

export const LETTER_TEMPLATE_DIR = path.resolve('uploads', 'letter-templates');
fs.mkdirSync(LETTER_TEMPLATE_DIR, { recursive: true });

const ALLOWED_MIME = new Map([
  ['application/pdf', '.pdf']
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LETTER_TEMPLATE_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME.get(file.mimetype) || path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) || ext === '.pdf') return cb(null, true);
  cb(new ApiError(400, 'Letter template must be a PDF'));
};

/** Single-file letter template upload (field "file"), max 15MB. */
export const uploadLetterTemplateFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }
}).single('file');

export const letterTemplateRelPath = (filename) => `uploads/letter-templates/${filename}`;
