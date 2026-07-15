/**
 * Blank fields filled when generating a letter from a LetterTemplate.
 * Keys align with AcroForm names on fillable template PDFs and {{placeholders}}.
 */

export const LETTER_COMMON_FIELDS = [
  { key: 'employeeName', label: 'Employee / candidate name', type: 'text', required: true, onPdf: true },
  { key: 'designation', label: 'Designation / position', type: 'text', required: true, onPdf: true },
  { key: 'department', label: 'Department', type: 'text', required: false, onPdf: true },
  { key: 'date', label: 'Letter date', type: 'text', required: false, onPdf: true },
  { key: 'companyName', label: 'Company name', type: 'text', required: false, onPdf: true },
  { key: 'location', label: 'Job location', type: 'text', required: false, onPdf: true }
];

const OFFER_EXTRA = [
  { key: 'joiningDate', label: 'Joining date', type: 'text', required: true, onPdf: true },
  { key: 'ctc', label: 'Annual CTC', type: 'text', required: false, onPdf: true },
  { key: 'offerDate', label: 'Offer date', type: 'text', required: false, onPdf: true }
];

const APPOINTMENT_EXTRA = [
  { key: 'joiningDate', label: 'Effective / joining date', type: 'text', required: true, onPdf: true },
  { key: 'employeeId', label: 'Employee ID', type: 'text', required: false, onPdf: true }
];

const SERVICE_EXTRA = [
  { key: 'employeeId', label: 'Employee ID', type: 'text', required: false, onPdf: true },
  { key: 'joiningDate', label: 'Date of joining', type: 'text', required: false, onPdf: true }
];

const FNF_EXTRA = [
  { key: 'employeeId', label: 'Employee ID', type: 'text', required: false, onPdf: true },
  { key: 'lastWorkingDay', label: 'Last working day', type: 'text', required: true, onPdf: true }
];

/** @type {Record<string, Array<{key:string,label:string,type:string,required:boolean,onPdf?:boolean}>>} */
export const LETTER_FIELDS_BY_TYPE = {
  OfferLetter: [...LETTER_COMMON_FIELDS, ...OFFER_EXTRA],
  AppointmentLetter: [...LETTER_COMMON_FIELDS, ...APPOINTMENT_EXTRA],
  ServiceLetter: [...LETTER_COMMON_FIELDS, ...SERVICE_EXTRA],
  FNFLetter: [...LETTER_COMMON_FIELDS, ...FNF_EXTRA]
};

export const fieldsForLetterType = (type) => LETTER_FIELDS_BY_TYPE[type] || LETTER_COMMON_FIELDS;

export const pdfFieldKeysForLetterType = (type) =>
  fieldsForLetterType(type).filter((f) => f.onPdf !== false).map((f) => f.key);

export const validateLetterFields = (type, values = {}) => {
  const defs = fieldsForLetterType(type);
  return defs.filter((f) => f.required && !String(values[f.key] ?? '').trim()).map((f) => f.label);
};

/** Substitute {{placeholders}} in body paragraphs. */
export const applyLetterPlaceholders = (paragraphs = [], fields = {}) =>
  paragraphs.map((p) => String(p).replace(/\{\{(\w+)\}\}/g, (_, key) => String(fields[key] ?? '').trim() || `{{${key}}}`));
