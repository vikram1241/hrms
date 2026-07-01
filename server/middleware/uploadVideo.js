import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

// Training videos — NOT statically served; streamed via an authorized,
// range-supporting route (Epic 18).
export const TRAINING_DIR = path.resolve(process.cwd(), 'uploads', 'training');
fs.mkdirSync(TRAINING_DIR, { recursive: true });

const ALLOWED_MIME = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov']
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TRAINING_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED_MIME.get(file.mimetype) || '.mp4'}`)
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) return cb(new ApiError(400, 'Video must be MP4, WEBM or MOV'));
  cb(null, true);
};

/** Single training-video upload (field "video"), max 200MB. */
export const uploadVideo = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024, files: 1 }
}).single('video');
