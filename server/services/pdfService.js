import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatINR } from '../utils/money.js';
import { paisaToWords } from '../utils/numberToWords.js';
import ApiError from '../utils/ApiError.js';

const ROOT = process.cwd();
export const PAYSLIP_DIR = path.resolve(ROOT, 'uploads', 'payslips');
export const OFFER_DIR = path.resolve(ROOT, 'uploads', 'offers');
export const SIGNED_OFFER_DIR = path.resolve(ROOT, 'uploads', 'offers', 'signed');
export const GENERATED_DOC_DIR = path.resolve(ROOT, 'uploads', 'documents', 'generated');
export const FILLED_DOC_DIR = path.resolve(ROOT, 'uploads', 'documents', 'filled');
export const CF_ISSUED_DIR = path.resolve(ROOT, 'uploads', 'cf-issued');
[PAYSLIP_DIR, OFFER_DIR, SIGNED_OFFER_DIR, GENERATED_DOC_DIR, FILLED_DOC_DIR, CF_ISSUED_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// PDF standard fonts are WinAnsi-encoded and lack many glyphs (e.g. ₹).
// Strip anything outside Latin-1 so drawText never throws.
const ascii = (s) => String(s ?? '').replace(/[^\x20-\xFF]/g, '');

const relPath = (absPath) => path.relative(ROOT, absPath).split(path.sep).join('/');

const loadImage = async (doc, relMaybe) => {
  if (!relMaybe) return null;
  const candidates = [
    path.resolve(ROOT, relMaybe),
    path.resolve(relMaybe),
    path.resolve('/app', relMaybe)
  ];
  for (const abs of candidates) {
    if (!fs.existsSync(abs)) continue;
    try {
      const bytes = await fsp.readFile(abs);
      const lower = abs.toLowerCase();
      if (lower.endsWith('.png')) return await doc.embedPng(bytes);
      return await doc.embedJpg(bytes);
    } catch {
      /* try next path / format */
    }
  }
  return null;
};

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

const formatOfferDate = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d || '');
  return `${dt.getDate()} ${MONTHS[dt.getMonth() + 1]} ${dt.getFullYear()}`;
};

const firstNameOf = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/);
  // Drop honorifics like Mr./Ms.
  const cleaned = parts.filter((p) => !/^(mr|mrs|ms|miss|dr)\.?$/i.test(p));
  return cleaned[0] || fullName || 'Candidate';
};

const amountCell = (paisa) => formatINR(paisa, { symbol: '', decimals: false }).trim();

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

  text('Mirus Med Sciences', 40, { size: 18, bold: true });
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
 * Render an offer letter PDF in the Mirus Med Sciences layout (Kamalakar sample):
 * - Company letter header / logo (from Company Settings branding)
 * - Faint logo watermark on every page
 * - Footer with address + GSTIN/CIN
 * - HR details block + Director stamp/signature from Company Settings
 * - Salary table from the frozen breakdown of the salary structure template
 *
 * @returns {Promise<string>} repo-relative path to the written file.
 */
export const generateOfferLetterPdf = async ({
  fullName,
  position,
  department,
  offerDate,
  joiningDate,
  breakdown,
  annualCTC,
  company,
  candidateEmail = '',
  phone = '',
  city = '',
  location = '',
  acceptByDate = null,
  bodyParagraphs = null
}) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.35, 0.35, 0.38);
  const brand = rgb(0.12, 0.22, 0.45);
  const headerBg = rgb(0.86, 0.92, 0.97);

  const companyName = company?.name || 'Mirus Med Sciences Private Limited';
  const addr = company?.address || {};
  const addrLine = [
    companyName,
    [addr.street, addr.city, addr.state, addr.country || 'India', addr.zipCode].filter(Boolean).join(', ')
  ].filter(Boolean).join(', ');
  const statutoryBits = [
    company?.statutory?.cin ? `CIN: ${company.statutory.cin}` : null,
    company?.statutory?.gstin ? `GSTIN: ${company.statutory.gstin}` : null
  ].filter(Boolean).join('; ');
  const contactBits = [
    company?.contactEmail || null,
    company?.hr?.email || null
  ].filter(Boolean).join('; ');

  const jobLocation = location || [addr.city, addr.state].filter(Boolean).join(', ') || 'Hyderabad, Telangana';
  const offerDt = offerDate || new Date();
  const joinDt = joiningDate || offerDt;
  const acceptDt = acceptByDate || joinDt;
  const firstName = firstNameOf(fullName);

  const logo = await loadImage(doc, company?.branding?.logoUrl);
  const letterheadImg = await loadImage(doc, company?.branding?.letterheadUrl);
  const stamp = await loadImage(doc, company?.branding?.stampUrl);
  const sigImg = await loadImage(doc, company?.branding?.signatureUrl);

  const hrName = (company?.hr?.name || '').trim();
  const hrTitle = (company?.hr?.designation || '').trim();
  const hrContact = (company?.hr?.contact || '').trim();
  const hrEmail = (company?.hr?.email || company?.contactEmail || '').trim();
  const directorName = (company?.branding?.authorizedSignatoryName || '').trim();
  const directorTitle = (company?.branding?.authorizedSignatoryDesignation || 'Director').trim();

  let page = doc.addPage([595, 842]);
  let y = 780;

  const drawWatermark = (p) => {
    if (!logo) return;
    const d = logo.scaleToFit(360, 360);
    p.drawImage(logo, {
      x: (595 - d.width) / 2,
      y: (842 - d.height) / 2 - 20,
      width: d.width,
      height: d.height,
      opacity: 0.12
    });
  };

  const drawHeader = (p) => {
    if (letterheadImg) {
      const d = letterheadImg.scaleToFit(520, 72);
      p.drawImage(letterheadImg, {
        x: (595 - d.width) / 2,
        y: 842 - 14 - d.height,
        width: d.width,
        height: d.height
      });
      return 842 - 26 - d.height;
    }
    if (logo) {
      const d = logo.scaleToFit(170, 64);
      p.drawImage(logo, {
        x: 595 - 40 - d.width,
        y: 842 - 18 - d.height,
        width: d.width,
        height: d.height,
        opacity: 1
      });
      return 842 - 30 - d.height;
    }
    p.drawText(ascii(companyName), { x: 280, y: 800, size: 12, font: bold, color: brand });
    return 780;
  };

  const drawFooter = (p) => {
    p.drawRectangle({ x: 0, y: 0, width: 595, height: 46, color: brand });
    const footer1 = ascii(addrLine);
    const footer2 = ascii([statutoryBits, contactBits].filter(Boolean).join('  |  '));
    p.drawText(footer1.slice(0, 115), { x: 28, y: 28, size: 6.5, font, color: rgb(1, 1, 1) });
    if (footer2) p.drawText(footer2.slice(0, 120), { x: 28, y: 14, size: 6.5, font, color: rgb(1, 1, 1) });
  };

  const decoratePage = (p) => {
    drawWatermark(p);
    const contentTop = drawHeader(p);
    drawFooter(p);
    return contentTop;
  };

  const newPage = () => {
    page = doc.addPage([595, 842]);
    y = decoratePage(page) - 12;
  };

  const ensure = (need = 60) => {
    if (y < need + 50) newPage();
  };

  const write = (text, opts = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const color = opts.color || ink;
    const x = opts.x ?? 48;
    const maxChars = opts.maxChars ?? 92;
    const gap = opts.gap ?? (size + 5);
    for (const ln of wrapText(text, maxChars)) {
      ensure(size + 50);
      page.drawText(ascii(ln), { x, y, size, font: f, color });
      y -= gap;
    }
  };

  y = decoratePage(page) - 8;

  page.drawText(ascii(formatOfferDate(offerDt)), { x: 420, y, size: 10, font, color: ink });
  y -= 22;

  write(fullName, { bold: true, size: 11, gap: 14 });
  if (phone) write(String(phone), { size: 10, gap: 13 });
  if (candidateEmail) write(String(candidateEmail), { size: 10, gap: 13 });
  if (city) write(city, { size: 10, gap: 18 });
  else y -= 6;

  write(`Dear ${firstName},`, { size: 11, gap: 16 });

  const defaultParas = [
    `We are pleased to extend this Offer of Employment for the position of ${position} in our organization, based at ${jobLocation}.`,
    `We were impressed with your profile, experience, and the interview discussions. We believe your skills and enthusiasm will be a valuable addition to our ${department || 'team'}. As a ${position}, you will play a key role in delivering business outcomes and contributing to the achievement of targets in your assigned territory. This position offers good growth opportunities within the organization for high performers.`
  ];
  const paras = Array.isArray(bodyParagraphs) && bodyParagraphs.length
    ? bodyParagraphs.map((p) => String(p)
      .replace(/\{\{employeeName\}\}/g, fullName)
      .replace(/\{\{designation\}\}/g, position)
      .replace(/\{\{department\}\}/g, department || '')
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{joiningDate\}\}/g, formatOfferDate(joinDt))
      .replace(/\{\{offerDate\}\}/g, formatOfferDate(offerDt))
      .replace(/\{\{ctc\}\}/g, formatINR(annualCTC))
      .replace(/\{\{location\}\}/g, jobLocation))
    : defaultParas;

  for (const para of paras) {
    write(para, { size: 10, gap: 13 });
    y -= 6;
  }

  write('Key Terms of the Offer:', { bold: true, size: 11, gap: 16 });
  write(`1. Date of Joining: on or before ${formatOfferDate(joinDt)}.`, { size: 10, gap: 14 });
  write(`2. Location: ${jobLocation}.`, { size: 10, gap: 14 });
  write(
    `3. Compensation: Your compensation has been structured as per industry standards for the role of ${position}. It includes a competitive fixed component along with performance-linked incentives. The detailed breakup is as follows:`,
    { size: 10, gap: 14 }
  );
  y -= 4;

  ensure(160);
  const tableX = 48;
  const col2X = 420;
  const tableW = 500;
  const rowH = 18;

  page.drawRectangle({ x: tableX, y: y - 4, width: tableW, height: rowH + 2, color: headerBg });
  page.drawText('Particulars', { x: tableX + 8, y, size: 10, font: bold, color: ink });
  page.drawText('Amount (INR)', { x: col2X, y, size: 10, font: bold, color: ink });
  y -= rowH + 4;

  for (const e of (breakdown?.earnings || [])) {
    ensure(40);
    page.drawText(ascii(e.label), { x: tableX + 8, y, size: 10, font, color: ink });
    page.drawText(ascii(amountCell(e.monthlyAmount)), { x: col2X, y, size: 10, font, color: ink });
    y -= rowH;
  }

  ensure(40);
  page.drawText('Gross Month Salary', { x: tableX + 8, y, size: 10, font: bold, color: ink });
  page.drawText(ascii(amountCell(breakdown?.grossEarnings || 0)), { x: col2X, y, size: 10, font: bold, color: ink });
  y -= rowH;

  for (const d of (breakdown?.deductions || []).filter((x) =>
    /pf|provident|esi|employer/i.test(`${x.key || ''} ${x.label || ''}`)
  )) {
    ensure(40);
    page.drawText(ascii(d.label), { x: tableX + 8, y, size: 10, font, color: ink });
    page.drawText(ascii(amountCell(d.monthlyAmount)), { x: col2X, y, size: 10, font, color: ink });
    y -= rowH;
  }

  const monthlyCtc = Math.round(Number(annualCTC || 0) / 12);
  ensure(40);
  page.drawText('Total CTC (Monthly)', { x: tableX + 8, y, size: 10, font: bold, color: ink });
  page.drawText(ascii(amountCell(monthlyCtc)), { x: col2X, y, size: 10, font: bold, color: ink });
  y -= rowH;

  ensure(40);
  page.drawText('Incentives / Performance Bonus', { x: tableX + 8, y, size: 10, font, color: ink });
  page.drawText('As per Company incentive scheme', { x: col2X - 40, y, size: 9, font, color: muted });
  y -= rowH + 10;

  write(
    `Annual CTC (Cost to Company) will be approximately ${formatINR(annualCTC)} (${paisaToWords(annualCTC)}) subject to statutory deductions.`,
    { bold: true, size: 10, gap: 14 }
  );
  write(
    'Travel / Conveyance: Reimbursement of actual expenses as per Company policy (with supporting bills).',
    { bold: true, size: 10, gap: 16 }
  );

  write('4. Probation Period: 6 (Six) months from the date of joining.', { size: 10, gap: 14 });
  write('5. Other Conditions:', { size: 10, gap: 14 });
  write('- This offer is subject to successful background verification and medical fitness test.', { size: 10, gap: 13, x: 56, maxChars: 88 });
  write('- Your employment will be governed by the rules and policies of the Company.', { size: 10, gap: 13, x: 56, maxChars: 88 });
  write('- You will be required to sign the standard Service Agreement / Confidentiality Agreement on joining.', { size: 10, gap: 16, x: 56, maxChars: 88 });

  write(
    `Please convey your acceptance by signing and returning the duplicate copy of this letter on or before ${formatOfferDate(acceptDt)}. Upon acceptance, we will issue the formal Appointment Letter.`,
    { size: 10, gap: 16 }
  );
  write('We look forward to your positive response and a long, mutually beneficial association.', { size: 10, gap: 24 });

  // Closing: HR details (left) + Director stamp/signature (right)
  ensure(200);
  const closeTop = y;

  write('HR Details', { bold: true, size: 10, gap: 14 });
  if (hrName) write(hrName, { bold: true, size: 10, gap: 13 });
  if (hrTitle) write(hrTitle, { size: 10, gap: 12 });
  if (hrContact) write(`Contact: ${hrContact}`, { size: 9, gap: 12, color: muted });
  if (hrEmail) write(`Email: ${hrEmail}`, { size: 9, gap: 12, color: muted });
  if (!hrName && !hrTitle && !hrContact && !hrEmail) {
    write('(Configure HR Name, Designation, Contact and Email in Company Settings)', { size: 8, gap: 12, color: muted });
  }

  const sealY = closeTop - 10;
  if (sigImg) {
    const d = sigImg.scaleToFit(150, 52);
    page.drawImage(sigImg, { x: 360, y: sealY - d.height, width: d.width, height: d.height });
  }
  if (stamp) {
    const d = stamp.scaleToFit(95, 95);
    page.drawImage(stamp, {
      x: 470,
      y: sealY - d.height - (sigImg ? 8 : 0),
      width: d.width,
      height: d.height,
      opacity: 0.92
    });
  }
  page.drawText(ascii(directorName || 'Authorized Signatory'), {
    x: 360, y: sealY - 70, size: 9, font: bold, color: ink
  });
  page.drawText(ascii(directorTitle), {
    x: 360, y: sealY - 84, size: 8, font, color: muted
  });

  y = Math.min(y, sealY - 110);

  ensure(150);
  write('Acceptance of Offer', { bold: true, size: 11, gap: 16 });
  write('I have read and understood the terms of the Offer and hereby accept the same.', { size: 10, gap: 20 });
  page.drawText(ascii(`Name: ${fullName}`), { x: 48, y, size: 10, font, color: ink });
  y -= 22;
  page.drawText('Date: ____________________', { x: 48, y, size: 10, font, color: ink });
  y -= 28;
  page.drawText('Candidate Signature:', { x: 48, y, size: 10, font: bold, color: ink });
  page.drawLine({ start: { x: 180, y: y - 2 }, end: { x: 400, y: y - 2 }, thickness: 1, color: ink });

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
  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  const dims = png.scaleToFit(180, 60);
  page.drawImage(png, { x: 185, y: 70, width: dims.width, height: dims.height });

  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(ascii(`Signed by ${name} on ${new Date(signedAt).toISOString()}`), {
    x: 48, y: 55, size: 8, font, color: rgb(0.3, 0.3, 0.3)
  });

  const file = path.join(SIGNED_OFFER_DIR, `signed-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};


// --- Epic 10: company-sealed statutory document generation ---

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
  const letterheadImg = await loadImage(doc, company?.branding?.letterheadUrl);
  const logo = await loadImage(doc, company?.branding?.logoUrl);
  if (letterheadImg) {
    const d = letterheadImg.scaleToFit(520, 56);
    page.drawImage(letterheadImg, { x: (595 - d.width) / 2, y: 842 - 18 - d.height, width: d.width, height: d.height });
    y = 842 - 28 - d.height - 12;
  } else if (logo) {
    const d = logo.scaleToFit(120, 48);
    page.drawImage(logo, { x: 40, y: 792, width: d.width, height: d.height });
    write(companyName, 170, { size: 18, bold: true, gap: 26 });
  } else {
    write(companyName, 40, { size: 18, bold: true, gap: 26 });
  }
  write(title.toUpperCase(), 40, { size: 13, bold: true, gap: 26 });
  write(`Date: ${new Date(effectiveDate || Date.now()).toDateString()}`);
  if (employeeName) write(`To: ${employeeName}${designation ? `, ${designation}` : ''}`, 40, { gap: 24 });

  for (const para of paragraphs || []) {
    for (const ln of wrapText(para, 95)) write(ln, 40, { size: 10, gap: 15 });
    y -= 8;
  }

  // HR details (when configured) above the authorized seal.
  const hrName = company?.hr?.name;
  if (hrName) {
    write(hrName, 40, { size: 10, bold: true, gap: 14 });
    if (company.hr.designation) write(company.hr.designation, 40, { size: 9, gap: 12 });
    if (company.hr.contact) write(company.hr.contact, 40, { size: 9, gap: 12 });
    if (company.hr.email) write(company.hr.email, 40, { size: 9, gap: 16 });
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

/**
 * Bake company logo/stamp/signature onto the last page of an existing PDF.
 * Used after AcroForm fill so every issued letter carries the company seal.
 * @returns {Promise<string>} repo-relative path to sealed copy
 */
export const applyCompanySeal = async (sourceRelPath, company, { destDir = GENERATED_DOC_DIR } = {}) => {
  const sourceAbs = path.resolve(ROOT, sourceRelPath);
  if (!fs.existsSync(sourceAbs)) throw new ApiError(404, 'Source PDF not found');

  const doc = await PDFDocument.load(await fsp.readFile(sourceAbs));
  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const black = rgb(0.1, 0.1, 0.1);

  const stamp = await loadImage(doc, company?.branding?.stampUrl);
  if (stamp) {
    const d = stamp.scaleToFit(100, 100);
    page.drawImage(stamp, { x: 420, y: 80, width: d.width, height: d.height, opacity: 0.9 });
  }
  const sig = await loadImage(doc, company?.branding?.signatureUrl);
  if (sig) {
    const d = sig.scaleToFit(150, 50);
    page.drawImage(sig, { x: 40, y: 110, width: d.width, height: d.height });
  }
  if (company?.branding?.authorizedSignatoryName || sig || stamp) {
    page.drawLine({ start: { x: 40, y: 105 }, end: { x: 220, y: 105 }, thickness: 1, color: black });
    page.drawText(ascii(`Authorized Signatory: ${company?.branding?.authorizedSignatoryName || ''}`), {
      x: 40, y: 90, size: 9, font, color: black
    });
    if (company?.branding?.authorizedSignatoryDesignation) {
      page.drawText(ascii(company.branding.authorizedSignatoryDesignation), {
        x: 40, y: 76, size: 8, font, color: rgb(0.3, 0.3, 0.3)
      });
    }
  }

  const file = path.join(destDir, `sealed-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};

/**
 * Generate a letter from a LetterTemplate (C&F-style).
 * Prefers AcroForm fill on the uploaded PDF; otherwise renders bodyParagraphs
 * (or a sensible default) and always applies the company seal.
 */
export const generateLetterFromTemplate = async ({
  template,
  fields = {},
  company,
  destDir = OFFER_DIR
}) => {
  const title = template?.title || template?.name || 'Letter';
  const companyName = company?.name || fields.companyName || 'Company';
  const merged = {
    companyName,
    hrName: company?.hr?.name || '',
    hrDesignation: company?.hr?.designation || '',
    hrContact: company?.hr?.contact || '',
    hrEmail: company?.hr?.email || '',
    ...fields
  };

  // Prefer type-specific template file; else company-wide letter outline/template.
  const sourceFile = template?.fileUrl || company?.branding?.letterOutlineUrl || null;

  if (sourceFile && (await pdfHasAcroForms(sourceFile))) {
    const filled = await fillAcroFormPdf(sourceFile, merged);
    const sealed = await applyCompanySeal(filled, company, { destDir });
    try { await fsp.unlink(path.resolve(ROOT, filled)); } catch { /* ignore */ }
    return sealed;
  }

  // Text fallback: substitute placeholders in body paragraphs, or minimal default copy.
  let paragraphs = Array.isArray(template?.bodyParagraphs) ? [...template.bodyParagraphs] : [];
  if (!paragraphs.length) {
    paragraphs = [
      `Dear ${merged.employeeName || 'Candidate'},`,
      `This letter confirms your ${merged.designation || 'appointment'} with ${companyName}`
        + (merged.department ? ` in the ${merged.department} department` : '')
        + (merged.joiningDate ? `, effective ${merged.joiningDate}` : '')
        + '.',
      merged.ctc ? `Annual CTC: ${merged.ctc}.` : '',
      'Please retain this letter for your records.'
    ].filter(Boolean);
  } else {
    paragraphs = paragraphs.map((p) =>
      String(p).replace(/\{\{(\w+)\}\}/g, (_, key) => String(merged[key] ?? '').trim() || `{{${key}}}`)
    );
  }

  const generated = await generateCompanyDocPdf({
    title,
    paragraphs,
    company,
    employeeName: merged.employeeName,
    designation: merged.designation,
    effectiveDate: merged.date || merged.offerDate || merged.joiningDate || Date.now()
  });

  // generateCompanyDocPdf already seals; move into destDir when different.
  if (destDir === GENERATED_DOC_DIR) return generated;
  const bytes = await fsp.readFile(path.resolve(ROOT, generated));
  const dest = path.join(destDir, `letter-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(dest, bytes);
  try { await fsp.unlink(path.resolve(ROOT, generated)); } catch { /* ignore */ }
  return relPath(dest);
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

/** True when the PDF has at least one AcroForm field. */
export const pdfHasAcroForms = async (sourceRelPath) => {
  const sourceAbs = path.resolve(ROOT, sourceRelPath);
  if (!fs.existsSync(sourceAbs)) return false;
  try {
    const doc = await PDFDocument.load(await fsp.readFile(sourceAbs));
    return doc.getForm().getFields().length > 0;
  } catch {
    return false;
  }
};

/**
 * Generate a filled C&F agreement PDF.
 * Prefers filling AcroForm fields on the uploaded template when present;
 * otherwise renders a complete agreement page with the blank values inserted.
 * @returns {Promise<string>} repo-relative path
 */
export const generateCFAgreementPdf = async ({ type, fields = {}, company, templateTitle, templateFileUrl }) => {
  const v = (k, fallback = '') => String(fields[k] ?? fallback).trim();

  if (templateFileUrl && (await pdfHasAcroForms(templateFileUrl))) {
    const filled = await fillAcroFormPdf(templateFileUrl, fields);
    // Move/copy into cf-issued for a stable issued-docs location.
    const bytes = await fsp.readFile(path.resolve(ROOT, filled));
    const dest = path.join(CF_ISSUED_DIR, `cf-${crypto.randomUUID()}.pdf`);
    await fsp.writeFile(dest, bytes);
    try { await fsp.unlink(path.resolve(ROOT, filled)); } catch { /* ignore */ }
    return relPath(dest);
  }

  const companyName = company?.name || 'Mirus Med Sciences Private Limited';
  const typeTitles = {
    CFAgent: 'C & F AGENT AGREEMENT',
    CFDistributor: 'C & F DISTRIBUTOR AGREEMENT',
    CFWholesaler: 'C & F WHOLESALER AGREEMENT'
  };
  const partyLabel = {
    CFAgent: 'C & F Agent',
    CFDistributor: 'C&F Distributor',
    CFWholesaler: 'C&F Wholesaler'
  }[type] || 'C&F Partner';

  const title = templateTitle || typeTitles[type] || 'C & F AGREEMENT';
  const day = v('agreementDay', '____');
  const month = v('agreementMonth', '____');
  const year = v('agreementYear', '__');
  const place = v('agreementPlace', '____________');
  const partyName = v('partyName', '________________');
  const partyAddress = v('partyAddress', '________________');
  const territory = v('territory', '____________');
  const margin = v('margin', '____');
  const godown = v('godownAddress', '____________');
  const target = v('monthlyTarget', '____');
  const deposit = v('securityDeposit', '____________');
  const witness1 = v('witness1', '________________');
  const witness2 = v('witness2', '________________');

  const paragraphs = [
    `This agreement is entered into on this ${day} day of ${month} Year 20${year} at ${place}.`,
    `By and between: ${companyName} (hereinafter referred to as the "Company")`,
    `AND`,
    `${partyName}`,
    partyAddress,
    `hereinafter referred to as the "${partyLabel}".`,
    `WHEREAS the Company desires to appoint the ${partyLabel} for the sale and distribution of its Products in the assigned territory, and the ${partyLabel} has agreed to act on the following terms.`,
    `1. Appointment & Territory`,
    `The Company hereby appoints the ${partyLabel} for distribution of its Products in the territory of ${territory} (the "Assigned Territory").`,
    `2. Duration`,
    `This Agreement shall be effective from the ${day} day of ${month} 20${year} and shall remain in force for a period of one year. It may be renewed by mutual written agreement.`,
    `3. Supply of Products`,
    `3.1 Products will be supplied on FOR basis to the ${partyLabel}'s godown/warehouse at ${godown} at the prices agreed upon.`,
    `3.2 A margin of ${margin} shall be allowed to the ${partyLabel}.`,
    `3.3 Payment terms shall be advance payment / as mutually agreed. Orders shall be placed at least 30 days in advance.`,
    `4. Sales Target`,
    `The monthly sales target for the Assigned Territory shall be ${target}. The ${partyLabel} shall make best efforts to achieve the target.`,
    `5. Security Deposit`,
    `The interest-free security deposit as agreed by both parties in this agreement will be Rs ${deposit}.`,
    `6. Obligations`,
    `The ${partyLabel} shall maintain valid drug licenses where applicable, keep at least 30 days inventory, maintain stock registers, ensure safe storage, appoint dealers/wholesalers/retailers to cover the Assigned Territory, and not deal with competitor products during the term.`,
    `7. Termination`,
    `Either party may terminate this Agreement by giving three months' written notice. Upon termination, outstanding dues shall be settled and any security deposit refunded within 45 days after adjustment.`,
    `8. Jurisdiction`,
    `All disputes shall be subject to the jurisdiction of courts at Mumbai only. Arbitration under the Arbitration and Conciliation Act, 1996 shall also apply.`,
    `IN WITNESS WHEREOF the parties have executed this Agreement on the date first above written.`
  ];

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.12, 0.12, 0.12);
  let page = doc.addPage([595, 842]);
  let y = 800;

  const ensureSpace = (need = 40) => {
    if (y < need) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
  };
  const write = (s, opts = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    ensureSpace(size + 20);
    page.drawText(ascii(s), { x: opts.x ?? 48, y, size, font: f, color: black });
    y -= opts.gap ?? (size + 6);
  };

  write(companyName, { size: 14, bold: true, gap: 20 });
  write(title, { size: 12, bold: true, gap: 22 });

  for (const para of paragraphs) {
    if (/^\d+\. /.test(para) || para === 'AND') {
      y -= 6;
      write(para, { size: 10, bold: true, gap: 14 });
      continue;
    }
    for (const ln of wrapText(para, 92)) write(ln, { size: 10, gap: 13 });
    y -= 4;
  }

  y -= 16;
  ensureSpace(120);
  write(`For ${companyName}`, { size: 10, bold: true, gap: 36 });
  write('Authorized Signatory', { size: 9, gap: 28 });
  write(`${partyLabel}`, { size: 10, bold: true, gap: 36 });
  write('Signature & Seal', { size: 9, gap: 24 });
  write('Witnesses:', { size: 10, bold: true, gap: 16 });
  write(`1. ${witness1}`, { size: 10, gap: 14 });
  write(`2. ${witness2}`, { size: 10, gap: 14 });

  const file = path.join(CF_ISSUED_DIR, `cf-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};
