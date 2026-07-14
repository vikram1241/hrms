/**
 * Blank fields users fill when generating a C&F agreement.
 * Keys are shared with AcroForm names on fillable template PDFs.
 */

export const CF_COMMON_SEND_FIELDS = [
  { key: 'recipientEmail', label: 'Recipient email', type: 'email', required: true, onPdf: false }
];

const SHARED = [
  { key: 'agreementDay', label: 'Agreement day (e.g. 14)', type: 'text', required: true, onPdf: true },
  { key: 'agreementMonth', label: 'Agreement month (e.g. July)', type: 'text', required: true, onPdf: true },
  { key: 'agreementYear', label: 'Agreement year (e.g. 26)', type: 'text', required: true, onPdf: true },
  { key: 'agreementPlace', label: 'Place of agreement', type: 'text', required: true, onPdf: true },
  { key: 'partyName', label: 'Party name (Mr/Mrs/Ms …)', type: 'text', required: true, onPdf: true },
  { key: 'partyAddress', label: 'Party address', type: 'textarea', required: true, onPdf: true },
  { key: 'territory', label: 'Assigned territory / market', type: 'text', required: true, onPdf: true },
  { key: 'margin', label: 'Margin (e.g. 15%)', type: 'text', required: true, onPdf: true },
  { key: 'godownAddress', label: 'Godown / warehouse address', type: 'text', required: true, onPdf: true },
  { key: 'monthlyTarget', label: 'Monthly sales target', type: 'text', required: false, onPdf: true },
  { key: 'securityDeposit', label: 'Security deposit (₹)', type: 'text', required: false, onPdf: true },
  { key: 'witness1', label: 'Witness 1 name', type: 'text', required: false, onPdf: true },
  { key: 'witness2', label: 'Witness 2 name', type: 'text', required: false, onPdf: true }
];

/** @type {Record<string, Array<{key:string,label:string,type:string,required:boolean,onPdf?:boolean}>>} */
export const CF_FIELDS_BY_TYPE = {
  CFAgent: [...CF_COMMON_SEND_FIELDS, ...SHARED],
  CFDistributor: [...CF_COMMON_SEND_FIELDS, ...SHARED],
  CFWholesaler: [...CF_COMMON_SEND_FIELDS, ...SHARED]
};

export const fieldsForType = (type) => CF_FIELDS_BY_TYPE[type] || CF_FIELDS_BY_TYPE.CFAgent;

export const pdfFieldKeysForType = (type) =>
  fieldsForType(type).filter((f) => f.onPdf !== false).map((f) => f.key);

export const validateCFFields = (type, values = {}) => {
  const defs = fieldsForType(type);
  const missing = defs.filter((f) => f.required && !String(values[f.key] ?? '').trim()).map((f) => f.label);
  return missing;
};
