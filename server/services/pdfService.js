import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatINR } from '../utils/money.js';
import ApiError from '../utils/ApiError.js';

const ROOT = process.cwd();
export const PAYSLIP_DIR = path.resolve(ROOT, 'uploads', 'payslips');
export const OFFER_DIR = path.resolve(ROOT, 'uploads', 'offers');
export const SIGNED_OFFER_DIR = path.resolve(ROOT, 'uploads', 'offers', 'signed');
export const GENERATED_DOC_DIR = path.resolve(ROOT, 'uploads', 'documents', 'generated');
export const FILLED_DOC_DIR = path.resolve(ROOT, 'uploads', 'documents', 'filled');
[PAYSLIP_DIR, OFFER_DIR, SIGNED_OFFER_DIR, GENERATED_DOC_DIR, FILLED_DOC_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// PDF standard fonts are WinAnsi-encoded and lack many glyphs (e.g. ₹).
// Strip anything outside Latin-1 so drawText never throws.
const ascii = (s) => String(s ?? '').replace(/[^\x20-\xFF]/g, '');

const relPath = (absPath) => path.relative(ROOT, absPath).split(path.sep).join('/');

/**
 * Render a SalarySlip document to a print-ready A4 PDF.
 * @returns {Promise<string>} repo-relative path to the written file.
 */
export const generatePayslipPdf = async (slip) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.1);
  let y = 800;

  const text = (s, x, opts = {}) =>
    page.drawText(ascii(s), { x, y: opts.y ?? y, size: opts.size ?? 10, font: opts.bold ? bold : font, color: black });

  text('XYZ Software Solutions', 40, { size: 18, bold: true });
  text(`Payslip for ${MONTHS[slip.month]} ${slip.year}`, 40, { y: 778, size: 12, bold: true });
  page.drawLine({ start: { x: 40, y: 770 }, end: { x: 555, y: 770 }, thickness: 1, color: black });

  y = 750;
  const meta = slip.metaSnapshot;
  [
    [`Employee: ${meta.fullName} (${meta.employeeDisplayId})`, `Department: ${meta.department}`],
    [`Designation: ${meta.designation}`, `PAN: ${meta.pan || '-'}`],
    [`UAN: ${meta.uan || '-'}`, `Bank A/C: ${meta.bankAccountHidden || '-'}`]
  ].forEach((row) => { text(row[0], 40); text(row[1], 320); y -= 18; });

  y -= 10;
  text('Earnings', 40, { bold: true }); text('Deductions', 320, { bold: true });
  y -= 16;
  const startY = y;
  slip.earningsLedger.forEach((e) => { text(e.label, 40); text(formatINR(e.amount), 230); y -= 15; });
  const earningsEndY = y;
  y = startY;
  slip.deductionsLedger.forEach((d) => { text(d.label, 320); text(formatINR(d.amount), 500); y -= 15; });
  y = Math.min(earningsEndY, y) - 12;

  page.drawLine({ start: { x: 40, y: y + 6 }, end: { x: 555, y: y + 6 }, thickness: 0.5, color: black });
  text(`Gross Earnings: ${formatINR(slip.financialSummary.grossEarnings)}`, 40, { bold: true });
  text(`Total Deductions: ${formatINR(slip.financialSummary.totalDeductions)}`, 320, { bold: true });
  y -= 22;
  text(`Net Pay: ${formatINR(slip.financialSummary.netPay)}`, 40, { size: 12, bold: true });
  y -= 16;
  text(`(${slip.financialSummary.netPayInWords})`, 40, { size: 9 });
  y -= 30;
  text('This is a system-generated payslip and does not require a signature.', 40, { size: 8 });

  const file = path.join(PAYSLIP_DIR, `payslip-${slip.employeeId}-${slip.year}-${String(slip.month).padStart(2, '0')}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};

/**
 * Render an offer letter PDF from offer details and the frozen salary breakdown.
 * @returns {Promise<string>} repo-relative path to the written file.
 */
export const generateOfferLetterPdf = async ({ fullName, position, department, offerDate, joiningDate, breakdown, annualCTC }) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.1);
  let y = 800;
  const line = (s, x = 40, opts = {}) => {
    page.drawText(ascii(s), { x, y, size: opts.size ?? 11, font: opts.bold ? bold : font, color: black });
    y -= opts.gap ?? 18;
  };

  line('XYZ Software Solutions', 40, { size: 18, bold: true, gap: 24 });
  line('LETTER OF EMPLOYMENT OFFER', 40, { size: 13, bold: true, gap: 28 });
  line(`Date: ${new Date(offerDate).toDateString()}`);
  line(`Dear ${fullName},`, 40, { gap: 24 });
  line(`We are pleased to offer you the position of ${position} in our ${department} department.`);
  line(`Your tentative date of joining is ${new Date(joiningDate).toDateString()}.`, 40, { gap: 24 });
  line(`Annual CTC: ${formatINR(annualCTC)}`, 40, { bold: true, gap: 22 });

  line('Monthly Compensation Breakdown', 40, { bold: true });
  (breakdown.earnings || []).forEach((e) => line(`  ${e.label}: ${formatINR(e.monthlyAmount)}`, 40, { size: 10, gap: 15 }));
  line(`  Gross: ${formatINR(breakdown.grossEarnings)}`, 40, { size: 10, gap: 15 });
  line(`  Total Deductions: ${formatINR(breakdown.totalDeductions)}`, 40, { size: 10, gap: 15 });
  line(`  Net Take-Home (monthly): ${formatINR(breakdown.netTakeHome)}`, 40, { size: 10, bold: true, gap: 40 });

  line('To accept, please sign in the portal below.', 40, { gap: 60 });
  // Reserve a labelled signature zone near the bottom for the e-sign baker.
  page.drawText('Candidate Signature:', { x: 40, y: 120, size: 11, font: bold, color: black });
  page.drawLine({ start: { x: 180, y: 118 }, end: { x: 400, y: 118 }, thickness: 1, color: black });

  const file = path.join(OFFER_DIR, `offer-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};

/**
 * Bake a candidate's drawn signature (base64 PNG, optionally a data URL) onto
 * the offer PDF at the reserved signature zone, plus a name/timestamp caption.
 * @returns {Promise<string>} repo-relative path to the signed file.
 */
export const bakeSignatureOnOffer = async (sourceRelPath, signatureBase64, { name, signedAt }) => {
  const sourceAbs = path.resolve(ROOT, sourceRelPath);
  if (!fs.existsSync(sourceAbs)) throw new ApiError(404, 'Source offer PDF not found');

  const raw = String(signatureBase64).replace(/^data:image\/png;base64,/, '');
  let pngBytes;
  try {
    pngBytes = Buffer.from(raw, 'base64');
  } catch {
    throw new ApiError(400, 'Invalid signature image');
  }

  const doc = await PDFDocument.load(await fsp.readFile(sourceAbs));
  const png = await doc.embedPng(pngBytes);
  const page = doc.getPages()[0];
  const dims = png.scaleToFit(180, 60);
  page.drawImage(png, { x: 185, y: 122, width: dims.width, height: dims.height });

  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(ascii(`Signed by ${name} on ${new Date(signedAt).toISOString()}`), {
    x: 40, y: 100, size: 8, font, color: rgb(0.3, 0.3, 0.3)
  });

  const file = path.join(SIGNED_OFFER_DIR, `signed-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};

// --- Epic 10: company-sealed statutory document generation ---

const loadImage = async (doc, relMaybe) => {
  if (!relMaybe) return null;
  const abs = path.resolve(ROOT, relMaybe);
  if (!fs.existsSync(abs)) return null;
  const bytes = await fsp.readFile(abs);
  return abs.toLowerCase().endsWith('.png') ? doc.embedPng(bytes) : doc.embedJpg(bytes);
};

// Naive word-wrap for body paragraphs at a given width (in chars ~ points/6).
const wrapText = (str, max) => {
  const words = ascii(str).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
};

/**
 * Generate a company-issued statutory document (appointment letter, NDA,
 * handbook acknowledgment, code of conduct) as a PDF, sealed with the company
 * stamp + authorized-signatory signature when configured (Epic 10 + C).
 *
 * @param {{ title, paragraphs:string[], company, employeeName, designation, effectiveDate }} args
 * @returns {Promise<string>} repo-relative path to the generated file.
 */
export const generateCompanyDocPdf = async ({ title, paragraphs, company, employeeName, designation, effectiveDate }) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.1);
  let y = 800;
  const write = (s, x = 40, opts = {}) => {
    page.drawText(ascii(s), { x, y, size: opts.size ?? 11, font: opts.bold ? bold : font, color: opts.color || black });
    y -= opts.gap ?? 18;
  };

  const companyName = company?.name || 'Company';
  const logo = await loadImage(doc, company?.branding?.logoUrl);
  if (logo) { const d = logo.scaleToFit(120, 48); page.drawImage(logo, { x: 40, y: 792, width: d.width, height: d.height }); }
  write(companyName, logo ? 170 : 40, { size: 18, bold: true, gap: 26 });
  write(title.toUpperCase(), 40, { size: 13, bold: true, gap: 26 });
  write(`Date: ${new Date(effectiveDate || Date.now()).toDateString()}`);
  if (employeeName) write(`To: ${employeeName}${designation ? `, ${designation}` : ''}`, 40, { gap: 24 });

  for (const para of paragraphs || []) {
    for (const ln of wrapText(para, 95)) write(ln, 40, { size: 10, gap: 15 });
    y -= 8;
  }

  // Seal: stamp (right) + signature (left) near the bottom.
  const stamp = await loadImage(doc, company?.branding?.stampUrl);
  if (stamp) { const d = stamp.scaleToFit(100, 100); page.drawImage(stamp, { x: 420, y: 120, width: d.width, height: d.height, opacity: 0.9 }); }
  const sig = await loadImage(doc, company?.branding?.signatureUrl);
  if (sig) { const d = sig.scaleToFit(150, 50); page.drawImage(sig, { x: 40, y: 150, width: d.width, height: d.height }); }
  page.drawLine({ start: { x: 40, y: 145 }, end: { x: 220, y: 145 }, thickness: 1, color: black });
  page.drawText(ascii(`Authorized Signatory: ${company?.branding?.authorizedSignatoryName || ''}`), { x: 40, y: 130, size: 9, font, color: black });
  if (company?.branding?.authorizedSignatoryDesignation) {
    page.drawText(ascii(company.branding.authorizedSignatoryDesignation), { x: 40, y: 116, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
  }

  const file = path.join(GENERATED_DOC_DIR, `doc-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};

/** Bake a drawn counter-signature (base64 PNG) onto a generated document. */
export const bakeSignatureOnDoc = async (sourceRelPath, signatureBase64, { name, signedAt }) => {
  const sourceAbs = path.resolve(ROOT, sourceRelPath);
  if (!fs.existsSync(sourceAbs)) throw new ApiError(404, 'Source document not found');
  const raw = String(signatureBase64).replace(/^data:image\/png;base64,/, '');
  const pngBytes = Buffer.from(raw, 'base64');

  const doc = await PDFDocument.load(await fsp.readFile(sourceAbs));
  const png = await doc.embedPng(pngBytes);
  const page = doc.getPages()[0];
  const dims = png.scaleToFit(160, 55);
  page.drawImage(png, { x: 250, y: 122, width: dims.width, height: dims.height });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(ascii(`Acknowledged by ${name} on ${new Date(signedAt).toISOString()}`), { x: 250, y: 108, size: 8, font, color: rgb(0.3, 0.3, 0.3) });

  const file = path.join(GENERATED_DOC_DIR, `ack-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};

// --- Epic 17: fill an uploaded PDF's existing AcroForm fields, then flatten ---

/**
 * Fill the existing form fields of an uploaded PDF and flatten it so values are
 * permanent. Unknown field names are skipped. Handles text / checkbox /
 * dropdown / radio fields.
 * @returns {Promise<string>} repo-relative path to the filled file.
 */
export const fillAcroFormPdf = async (sourceRelPath, fieldValues = {}) => {
  const sourceAbs = path.resolve(ROOT, sourceRelPath);
  if (!fs.existsSync(sourceAbs)) throw new ApiError(404, 'Source PDF not found');

  const doc = await PDFDocument.load(await fsp.readFile(sourceAbs));
  const form = doc.getForm();

  for (const [name, value] of Object.entries(fieldValues)) {
    let field;
    try { field = form.getField(name); } catch { continue; } // field not present — skip
    const type = field.constructor?.name;
    try {
      if (type === 'PDFTextField') field.setText(String(value ?? ''));
      else if (type === 'PDFCheckBox') (value ? field.check() : field.uncheck());
      else if (type === 'PDFDropdown' || type === 'PDFRadioGroup') field.select(String(value));
      else if (type === 'PDFOptionList') field.select(String(value));
    } catch { /* ignore individual field set errors, keep filling the rest */ }
  }

  form.flatten(); // bake values into page content so they can't be edited later
  const file = path.join(FILLED_DOC_DIR, `filled-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};
