import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * LetterTemplate — per-company letter PDFs (C&F-style): upload a template with
 * blank/AcroForm fields, fill at generate/send time, seal with company branding.
 */
export const LETTER_TYPES = ['OfferLetter', 'AppointmentLetter', 'ServiceLetter', 'FNFLetter'];

export const LETTER_TYPE_LABELS = {
  OfferLetter: 'Offer Letter',
  AppointmentLetter: 'Appointment Letter',
  ServiceLetter: 'Service Letter',
  FNFLetter: 'Full & Final (FNF) Letter'
};

export const LETTER_PLACEHOLDERS = [
  'employeeName', 'designation', 'department', 'employeeId', 'date',
  'companyName', 'joiningDate', 'lastWorkingDay', 'ctc', 'offerDate', 'location'
];

const LetterTemplateSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  type: { type: String, enum: LETTER_TYPES, required: true, index: true },
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true },
  bodyParagraphs: [{ type: String }],
  fileUrl: { type: String, default: null },
  originalFileName: { type: String, trim: true },
  mimeType: { type: String, trim: true, default: 'application/pdf' },
  isDefault: { type: Boolean, default: false, index: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

LetterTemplateSchema.index({ companyId: 1, type: 1, name: 1 }, { unique: true });
LetterTemplateSchema.plugin(tenantScope);

export default mongoose.model('LetterTemplate', LetterTemplateSchema);
