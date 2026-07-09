import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * LetterTemplate — configurable letter/document templates set up per company:
 * Offer Letter, Appointment Letter, Service Letter and Full-&-Final (FNF) Letter.
 * Body paragraphs may contain placeholders (e.g. {{employeeName}}, {{designation}},
 * {{date}}, {{companyName}}, {{lastWorkingDay}}, {{ctc}}) substituted at generation.
 */
export const LETTER_TYPES = ['OfferLetter', 'AppointmentLetter', 'ServiceLetter', 'FNFLetter'];

export const LETTER_PLACEHOLDERS = [
  'employeeName', 'designation', 'department', 'employeeId', 'date',
  'companyName', 'joiningDate', 'lastWorkingDay', 'ctc'
];

const LetterTemplateSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  type: { type: String, enum: LETTER_TYPES, required: true, index: true },
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true }, // heading printed on the PDF
  bodyParagraphs: [{ type: String }],
  active: { type: Boolean, default: true }
}, { timestamps: true });

// A given letter template name is unique within a company + type.
LetterTemplateSchema.index({ companyId: 1, type: 1, name: 1 }, { unique: true });
LetterTemplateSchema.plugin(tenantScope);

export default mongoose.model('LetterTemplate', LetterTemplateSchema);
