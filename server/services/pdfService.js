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

const resolveAssetPath = (relMaybe) => {
  if (!relMaybe) return null;
  const candidates = [
    path.resolve(ROOT, relMaybe),
    path.resolve(relMaybe),
    path.resolve('/app', relMaybe)
  ];
  for (const abs of candidates) {
    if (fs.existsSync(abs)) return abs;
  }
  return null;
};

const loadImage = async (doc, relMaybe) => {
  const abs = resolveAssetPath(relMaybe);
  if (!abs) return null;
  try {
    const bytes = await fsp.readFile(abs);
    const lower = abs.toLowerCase();
    if (lower.endsWith('.png')) return await doc.embedPng(bytes);
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return await doc.embedJpg(bytes);
    // Non-image path (e.g. PDF letterhead) — skip; caller may use loadOutlinePage.
    return null;
  } catch {
    return null;
  }
};

/**
 * Load Company letter outline/template as a full-page background (PDF page 1 or image).
 * @returns {Promise<{ kind: 'pdf'|'image', embedded: any }|null>}
 */
const loadOutlinePage = async (doc, relMaybe) => {
  const abs = resolveAssetPath(relMaybe);
  if (!abs) return null;
  const lower = abs.toLowerCase();
  try {
    if (lower.endsWith('.pdf')) {
      const bytes = await fsp.readFile(abs);
      const [embedded] = await doc.embedPdf(bytes, [0]);
      return { kind: 'pdf', embedded };
    }
    const img = await loadImage(doc, relMaybe);
    if (!img) return null;
    return { kind: 'image', embedded: img };
  } catch {
    return null;
  }
};

/** A4 page geometry used by every generated company document. */
export const PAGE_W = 595;
export const PAGE_H = 842;
export const PAGE_MARGIN_X = 48;

/**
 * Shared company page chrome for all generated PDFs.
 * Prefer Company Settings → letter outline/template as the full-page background;
 * otherwise draw logo/letterhead + watermark + address footer.
 */
const createCompanyPageKit = async (doc, company, { font, bold } = {}) => {
  const bodyFont = font || await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = bold || await doc.embedFont(StandardFonts.HelveticaBold);
  const brand = rgb(0.12, 0.22, 0.45);
  const white = rgb(1, 1, 1);

  const companyName = company?.name || 'Company';
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

  const outline = await loadOutlinePage(doc, company?.branding?.letterOutlineUrl);
  const logo = await loadImage(doc, company?.branding?.logoUrl);
  const letterheadImg = await loadImage(doc, company?.branding?.letterheadUrl);

  const contentTopY = outline ? 722 : 730;
  const contentBottomY = outline ? 78 : 68;
  const footerH = 56;
  const MARGIN_X = PAGE_MARGIN_X;

  const drawOutline = (p) => {
    if (!outline) return;
    if (outline.kind === 'pdf') {
      p.drawPage(outline.embedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
      return;
    }
    p.drawImage(outline.embedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  };

  const drawWatermark = (p) => {
    if (outline || !logo) return;
    const d = logo.scaleToFit(360, 360);
    p.drawImage(logo, {
      x: (PAGE_W - d.width) / 2,
      y: (PAGE_H - d.height) / 2 - 20,
      width: d.width,
      height: d.height,
      opacity: 0.12
    });
  };

  const drawHeader = (p) => {
    if (outline) return contentTopY;
    if (letterheadImg) {
      const d = letterheadImg.scaleToFit(520, 72);
      p.drawImage(letterheadImg, {
        x: (PAGE_W - d.width) / 2,
        y: PAGE_H - 14 - d.height,
        width: d.width,
        height: d.height
      });
      return Math.min(contentTopY, PAGE_H - 28 - d.height);
    }
    if (logo) {
      const d = logo.scaleToFit(170, 64);
      p.drawImage(logo, {
        x: PAGE_W - 40 - d.width,
        y: PAGE_H - 18 - d.height,
        width: d.width,
        height: d.height
      });
      return Math.min(contentTopY, PAGE_H - 30 - d.height);
    }
    p.drawText(ascii(companyName), { x: 280, y: 800, size: 12, font: boldFont, color: brand });
    return 780;
  };

  const drawFooter = (p) => {
    if (outline) return;
    p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: footerH, color: brand });
    const line1 = ascii(addrLine).slice(0, 118);
    const line2 = ascii(statutoryBits).slice(0, 118);
    const line3 = ascii(contactBits).slice(0, 118);
    let fy = 38;
    if (line1) { p.drawText(line1, { x: 28, y: fy, size: 6.5, font: bodyFont, color: white }); fy -= 12; }
    if (line2) { p.drawText(line2, { x: 28, y: fy, size: 6.5, font: bodyFont, color: white }); fy -= 12; }
    if (line3) p.drawText(line3, { x: 28, y: fy, size: 6.5, font: bodyFont, color: white });
  };

  const decoratePage = (p) => {
    if (outline) {
      drawOutline(p);
      return contentTopY;
    }
    drawWatermark(p);
    const top = drawHeader(p);
    drawFooter(p);
    return top;
  };

  const addDecoratedPage = () => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const top = decoratePage(page);
    return { page, y: top - 10 };
  };

  return {
    PAGE_W,
    PAGE_H,
    MARGIN_X,
    CONTENT_WIDTH: PAGE_W - MARGIN_X * 2,
    contentTopY,
    contentBottomY,
    companyName,
    font: bodyFont,
    bold: boldFont,
    brand,
    hasOutline: Boolean(outline),
    decoratePage,
    addDecoratedPage
  };
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

/** Wrap mixed plain/bold segments to a max width using font metrics. */
const wrapRichSegments = (segments, maxWidth, size, font, boldFont) => {
  const words = [];
  for (const seg of segments) {
    const parts = ascii(seg.text).split(/(\s+)/).filter((p) => p.length);
    for (const p of parts) words.push({ text: p, bold: Boolean(seg.bold) });
  }
  const lines = [];
  let cur = [];
  let curW = 0;
  for (const w of words) {
    const f = w.bold ? boldFont : font;
    const ww = f.widthOfTextAtSize(w.text, size);
    if (cur.length && curW + ww > maxWidth && !/^\s+$/.test(w.text)) {
      lines.push(cur);
      cur = [];
      curW = 0;
    }
    if (!cur.length && /^\s+$/.test(w.text)) continue;
    cur.push(w);
    curW += ww;
  }
  if (cur.length) lines.push(cur);
  return lines;
};

/** Mark a dynamic value so template substitution can bold it later. */
const BOLD_OPEN = '\uE000';
const BOLD_CLOSE = '\uE001';
const boldMark = (value) => `${BOLD_OPEN}${ascii(value)}${BOLD_CLOSE}`;

const parseBoldMarks = (str) => {
  const segments = [];
  const re = new RegExp(`${BOLD_OPEN}([\\s\\S]*?)${BOLD_CLOSE}`, 'g');
  let last = 0;
  let m;
  const s = String(str ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) segments.push({ text: s.slice(last, m.index), bold: false });
    segments.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) segments.push({ text: s.slice(last), bold: false });
  return segments.length ? segments : [{ text: s, bold: false }];
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
 * Render a SalarySlip document to a print-ready A4 PDF on the company page template.
 * @returns {Promise<string>} repo-relative path to the written file.
 */
export const generatePayslipPdf = async (slip, company = null) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const kit = await createCompanyPageKit(doc, company, { font, bold });
  const ink = rgb(0.1, 0.1, 0.1);
  let { page, y } = kit.addDecoratedPage();

  const text = (s, x, opts = {}) =>
    page.drawText(ascii(s), {
      x,
      y: opts.y ?? y,
      size: opts.size ?? 10,
      font: opts.bold ? bold : font,
      color: ink
    });

  text(`Payslip for ${MONTHS[slip.month]} ${slip.year}`, kit.MARGIN_X, { size: 13, bold: true });
  y -= 20;
  page.drawLine({
    start: { x: kit.MARGIN_X, y: y + 6 },
    end: { x: PAGE_W - kit.MARGIN_X, y: y + 6 },
    thickness: 1,
    color: ink
  });
  y -= 16;

  const meta = slip.metaSnapshot;
  [
    [`Employee: ${meta.fullName} (${meta.employeeDisplayId})`, `Department: ${meta.department}`],
    [`Designation: ${meta.designation}`, `PAN: ${meta.pan || '-'}`],
    [`UAN: ${meta.uan || '-'}`, `Bank A/C: ${meta.bankAccountHidden || '-'}`]
  ].forEach((row) => {
    text(row[0], kit.MARGIN_X);
    text(row[1], 320);
    y -= 18;
  });

  y -= 10;
  text('Earnings', kit.MARGIN_X, { bold: true });
  text('Deductions', 320, { bold: true });
  y -= 16;
  const startY = y;
  slip.earningsLedger.forEach((e) => {
    text(e.label, kit.MARGIN_X);
    text(formatINR(e.amount), 230);
    y -= 15;
  });
  const earningsEndY = y;
  y = startY;
  slip.deductionsLedger.forEach((d) => {
    text(d.label, 320);
    text(formatINR(d.amount), 500);
    y -= 15;
  });
  y = Math.min(earningsEndY, y) - 12;

  page.drawLine({
    start: { x: kit.MARGIN_X, y: y + 6 },
    end: { x: PAGE_W - kit.MARGIN_X, y: y + 6 },
    thickness: 0.5,
    color: ink
  });
  text(`Gross Earnings: ${formatINR(slip.financialSummary.grossEarnings)}`, kit.MARGIN_X, { bold: true });
  text(`Total Deductions: ${formatINR(slip.financialSummary.totalDeductions)}`, 320, { bold: true });
  y -= 22;
  text(`Net Pay: ${formatINR(slip.financialSummary.netPay)}`, kit.MARGIN_X, { size: 12, bold: true });
  y -= 16;
  text(`(${slip.financialSummary.netPayInWords})`, kit.MARGIN_X, { size: 9 });
  y -= 30;
  text('This is a system-generated payslip and does not require a signature.', kit.MARGIN_X, { size: 8 });

  const file = path.join(PAYSLIP_DIR, `payslip-${slip.employeeId}-${slip.year}-${String(slip.month).padStart(2, '0')}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};

/**
 * Render an offer letter PDF aligned to the Mirus reference layout:
 * - Optional company letter outline/template as full-page background
 * - Otherwise: logo header, faint watermark, address/CIN/GST footer
 * - Inserted candidate/offer values bolded (print-safe highlight)
 * - HR block (left) + Director stamp/logo seal (right)
 * - Salary table from the frozen breakdown of the salary structure template
 *
 * @returns {Promise<{ pdfFileUrl: string, acceptancePlacement: object }>}
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
  const kit = await createCompanyPageKit(doc, company, { font, bold });
  const {
    MARGIN_X, CONTENT_WIDTH, contentBottomY, companyName, brand
  } = kit;
  const ink = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.35, 0.35, 0.38);
  const headerBg = rgb(0.86, 0.92, 0.97);

  const addr = company?.address || {};
  const jobLocation = location || [addr.city, addr.state].filter(Boolean).join(', ') || 'Hyderabad, Telangana';
  const offerDt = offerDate || new Date();
  const joinDt = joiningDate || offerDt;
  const acceptDt = acceptByDate || joinDt;
  const firstName = firstNameOf(fullName);
  const offerDateStr = formatOfferDate(offerDt);
  const joinDateStr = formatOfferDate(joinDt);
  const acceptDateStr = formatOfferDate(acceptDt);
  const ctcStr = formatINR(annualCTC);
  const ctcWords = paisaToWords(annualCTC);

  const logoWithStamp = await loadImage(doc, company?.branding?.logoWithStampUrl);
  const stamp = await loadImage(doc, company?.branding?.stampUrl);
  const sigImg = await loadImage(doc, company?.branding?.signatureUrl);

  const hrName = (company?.hr?.name || '').trim();
  const hrTitle = (company?.hr?.designation || '').trim();
  const hrContact = (company?.hr?.contact || '').trim();
  const hrEmail = (company?.hr?.email || company?.contactEmail || '').trim();
  const directorTitle = (company?.branding?.authorizedSignatoryDesignation || 'Director').trim() || 'Director';

  let { page, y } = kit.addDecoratedPage();
  let pageIndex = 0;

  const newPage = () => {
    ({ page, y } = kit.addDecoratedPage());
    pageIndex += 1;
  };

  const ensure = (need = 60) => {
    if (y < contentBottomY + need) newPage();
  };

  const write = (text, opts = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const color = opts.color || ink;
    const x = opts.x ?? MARGIN_X;
    const maxChars = opts.maxChars ?? 90;
    const gap = opts.gap ?? (size + 5);
    for (const ln of wrapText(text, maxChars)) {
      ensure(size + 8);
      page.drawText(ascii(ln), { x, y, size, font: f, color });
      y -= gap;
    }
  };

  const writeRich = (segmentsOrMarked, opts = {}) => {
    const size = opts.size ?? 10;
    const color = opts.color || ink;
    const x = opts.x ?? MARGIN_X;
    const maxWidth = opts.maxWidth ?? CONTENT_WIDTH;
    const gap = opts.gap ?? (size + 5);
    const segments = typeof segmentsOrMarked === 'string'
      ? parseBoldMarks(segmentsOrMarked)
      : segmentsOrMarked;
    const lines = wrapRichSegments(segments, maxWidth, size, font, bold);
    for (const line of lines) {
      ensure(size + 8);
      let cx = x;
      for (const seg of line) {
        const f = seg.bold ? bold : font;
        const t = ascii(seg.text);
        if (!t) continue;
        page.drawText(t, { x: cx, y, size, font: f, color });
        cx += f.widthOfTextAtSize(t, size);
      }
      y -= gap;
    }
  };

  // Date (right) — value bold
  {
    const label = 'Date: ';
    const value = offerDateStr;
    const size = 10;
    const totalW = font.widthOfTextAtSize(label, size) + bold.widthOfTextAtSize(value, size);
    const x0 = PAGE_W - MARGIN_X - totalW;
    page.drawText(label, { x: x0, y, size, font, color: ink });
    page.drawText(ascii(value), {
      x: x0 + font.widthOfTextAtSize(label, size),
      y,
      size,
      font: bold,
      color: ink
    });
  }
  y -= 24;

  writeRich([{ text: fullName, bold: true }], { size: 11, gap: 15 });
  if (phone) {
    writeRich([
      { text: 'Ph: ', bold: false },
      { text: phone, bold: true }
    ], { size: 10, gap: 14 });
  }
  if (candidateEmail) {
    writeRich([
      { text: 'email: ', bold: false },
      { text: candidateEmail, bold: true }
    ], { size: 10, gap: 14 });
  }
  if (city) writeRich([{ text: city, bold: true }], { size: 10, gap: 14 });
  y -= 18;

  // Main title — underlined, centered (reference style).
  ensure(44);
  const title = 'OFFER LETTER';
  const titleSize = 14;
  const titleWidth = bold.widthOfTextAtSize(title, titleSize);
  const titleX = (PAGE_W - titleWidth) / 2;
  page.drawText(title, { x: titleX, y, size: titleSize, font: bold, color: brand });
  page.drawLine({
    start: { x: titleX, y: y - 3 },
    end: { x: titleX + titleWidth, y: y - 3 },
    thickness: 1,
    color: brand
  });
  y -= 28;

  writeRich([
    { text: 'Dear ', bold: false },
    { text: firstName, bold: true },
    { text: ',', bold: false }
  ], { size: 11, gap: 18 });

  const defaultParas = [
    `We are pleased to extend this Offer of Employment for the position of ${boldMark(position)} in our organization, based at ${boldMark(jobLocation)}.`,
    `We were impressed with your profile, experience, and the interview discussions. We believe your skills and enthusiasm will be a valuable addition to our ${boldMark(department || 'team')}. As a ${boldMark(position)}, you will play a key role in delivering business outcomes and contributing to the achievement of targets in your assigned territory. This position offers good growth opportunities within the organization for high performers.`
  ];
  const paras = Array.isArray(bodyParagraphs) && bodyParagraphs.length
    ? bodyParagraphs.map((p) => String(p)
      .replace(/\{\{employeeName\}\}/g, boldMark(fullName))
      .replace(/\{\{designation\}\}/g, boldMark(position))
      .replace(/\{\{department\}\}/g, boldMark(department || ''))
      .replace(/\{\{companyName\}\}/g, boldMark(companyName))
      .replace(/\{\{joiningDate\}\}/g, boldMark(joinDateStr))
      .replace(/\{\{offerDate\}\}/g, boldMark(offerDateStr))
      .replace(/\{\{ctc\}\}/g, boldMark(ctcStr))
      .replace(/\{\{location\}\}/g, boldMark(jobLocation)))
    : defaultParas;

  for (const para of paras) {
    writeRich(para, { size: 10, gap: 14 });
    y -= 8;
  }

  y -= 4;
  write('Key Terms of the Offer:', { bold: true, size: 11, gap: 18 });
  writeRich([
    { text: '1. Date of Joining: on or before ', bold: true },
    { text: joinDateStr, bold: true },
    { text: '.', bold: false }
  ], { size: 10, gap: 16 });
  writeRich([
    { text: '2. Location: ', bold: false },
    { text: jobLocation, bold: true },
    { text: '.', bold: false }
  ], { size: 10, gap: 16 });
  writeRich([
    { text: '3. Compensation: ', bold: true },
    { text: 'Your compensation has been structured as per industry standards for the role of ', bold: false },
    { text: position, bold: true },
    { text: '. It includes a competitive fixed component along with performance-linked incentives. The detailed breakup is as follows:', bold: false }
  ], { size: 10, gap: 14 });
  y -= 8;

  // Bordered salary breakdown table (earnings, all deductions, net take-home, CTC).
  const monthlyCtc = Math.round(Number(annualCTC || 0) / 12);
  const salaryRows = [
    ...(breakdown?.earnings || []).map((e) => ({
      label: e.label,
      value: amountCell(e.monthlyAmount),
      bold: false
    })),
    {
      label: 'Gross Month Salary',
      value: amountCell(breakdown?.grossEarnings || 0),
      bold: true
    },
    ...(breakdown?.deductions || []).map((d) => ({
      label: d.label,
      value: amountCell(d.monthlyAmount),
      bold: false
    })),
    {
      label: 'Total Deductions',
      value: amountCell(breakdown?.totalDeductions || 0),
      bold: true
    },
    {
      label: 'Net Take Home (Monthly)',
      value: amountCell(breakdown?.netTakeHome || 0),
      bold: true
    },
    {
      label: 'Total CTC (Monthly)',
      value: amountCell(monthlyCtc),
      bold: true
    },
    {
      label: 'Incentives / Performance Bonus',
      value: 'As per Company incentive scheme',
      bold: false,
      mutedValue: true
    }
  ];

  const tableX = MARGIN_X;
  const tableW = CONTENT_WIDTH;
  const splitX = tableX + Math.round(tableW * 0.62);
  const colAmtRight = tableX + tableW - 10;
  const rowH = 18;
  const tableLine = rgb(0.55, 0.55, 0.58);
  const tableNeed = 24 + (salaryRows.length + 1) * rowH + 16;
  if (y < contentBottomY + tableNeed) newPage();
  else ensure(tableNeed);

  const tableTop = y + 12;
  // Header
  page.drawRectangle({
    x: tableX,
    y: y - 4,
    width: tableW,
    height: rowH + 2,
    color: headerBg
  });
  page.drawText('Particulars', { x: tableX + 8, y, size: 10, font: bold, color: ink });
  page.drawText('Amount (INR)', {
    x: colAmtRight - bold.widthOfTextAtSize('Amount (INR)', 10),
    y,
    size: 10,
    font: bold,
    color: ink
  });
  y -= rowH;

  for (const row of salaryRows) {
    page.drawLine({
      start: { x: tableX, y: y + rowH - 4 },
      end: { x: tableX + tableW, y: y + rowH - 4 },
      thickness: 0.5,
      color: tableLine
    });
    const f = row.bold ? bold : font;
    page.drawText(ascii(row.label), { x: tableX + 8, y, size: 10, font: f, color: ink });
    const val = ascii(row.value);
    const vf = row.mutedValue ? font : (row.bold ? bold : font);
    const vs = row.mutedValue ? 9 : 10;
    const vw = vf.widthOfTextAtSize(val, vs);
    page.drawText(val, {
      x: colAmtRight - vw,
      y,
      size: vs,
      font: vf,
      color: row.mutedValue ? muted : ink
    });
    y -= rowH;
  }

  const tableBottom = y + rowH - 4;
  page.drawRectangle({
    x: tableX,
    y: tableBottom,
    width: tableW,
    height: tableTop - tableBottom,
    borderColor: tableLine,
    borderWidth: 1
  });
  page.drawLine({
    start: { x: splitX, y: tableBottom },
    end: { x: splitX, y: tableTop },
    thickness: 0.5,
    color: tableLine
  });
  y -= 14;

  writeRich([
    { text: 'Annual CTC (Cost to Company) will be approximately ', bold: true },
    { text: ctcStr, bold: true },
    { text: ' (', bold: true },
    { text: ctcWords, bold: true },
    { text: ') subject to statutory deductions.', bold: true }
  ], { size: 10, gap: 15 });
  writeRich([
    { text: 'Travel / Conveyance: ', bold: true },
    { text: 'Reimbursement of actual expenses as per Company policy (with supporting bills).', bold: false }
  ], { size: 10, gap: 18 });

  writeRich([
    { text: '4. Probation Period: ', bold: true },
    { text: '6 (Six) months from the date of joining.', bold: false }
  ], { size: 10, gap: 16 });
  write('5. Other Conditions:', { bold: true, size: 10, gap: 15 });
  write('- This offer is subject to successful background verification and medical fitness test.', {
    size: 10, gap: 14, x: 56, maxChars: 86
  });
  write('- Your employment will be governed by the rules and policies of the Company.', {
    size: 10, gap: 14, x: 56, maxChars: 86
  });
  write('- You will be required to sign the standard Service Agreement / Confidentiality Agreement on joining.', {
    size: 10, gap: 16, x: 56, maxChars: 86
  });

  writeRich([
    { text: 'Please convey your acceptance by signing and returning the duplicate copy of this letter on or before ', bold: false },
    { text: acceptDateStr, bold: true },
    { text: '. Upon acceptance, we will issue the formal Appointment Letter.', bold: false }
  ], { size: 10, gap: 16 });
  y -= 6;
  write('We look forward to your positive response and a long, mutually beneficial association.', {
    size: 10, gap: 22
  });

  // Closing: Best regards + HR (left) + Director stamp/logo (right) — reference page 3.
  ensure(210);
  const closeTop = y;

  write('Best regards,', { bold: true, size: 10, gap: 15 });
  if (hrName) write(hrName, { bold: true, size: 10, gap: 14 });
  if (hrTitle) write(hrTitle, { bold: true, size: 10, gap: 14 });
  if (hrContact) write(`Contact: ${hrContact}`, { bold: true, size: 10, gap: 14 });
  if (hrEmail) write(hrEmail, { bold: true, size: 10, gap: 14 });
  if (!hrName && !hrTitle && !hrContact && !hrEmail) {
    write('(Configure HR details in Company Settings)', { size: 8, gap: 12, color: muted });
  }

  // Director seal on the right — prefer combined logo+stamp; else stamp with signature overlay.
  const sealBoxX = 380;
  const sealBoxW = 170;
  let sealBottom = closeTop;
  if (logoWithStamp) {
    const d = logoWithStamp.scaleToFit(120, 120);
    const sx = sealBoxX + (sealBoxW - d.width) / 2;
    const sy = closeTop - d.height;
    page.drawImage(logoWithStamp, { x: sx, y: sy, width: d.width, height: d.height, opacity: 0.96 });
    sealBottom = sy;
  } else {
    if (stamp) {
      const d = stamp.scaleToFit(110, 110);
      const sx = sealBoxX + (sealBoxW - d.width) / 2;
      const sy = closeTop - d.height;
      page.drawImage(stamp, { x: sx, y: sy, width: d.width, height: d.height, opacity: 0.94 });
      sealBottom = sy;
    }
    if (sigImg) {
      const d = sigImg.scaleToFit(140, 48);
      const sx = sealBoxX + (sealBoxW - d.width) / 2;
      const sy = Math.max(sealBottom + 20, closeTop - 70);
      page.drawImage(sigImg, { x: sx, y: sy, width: d.width, height: d.height });
      sealBottom = Math.min(sealBottom, sy);
    }
  }
  {
    const label = ascii(directorTitle);
    const lw = bold.widthOfTextAtSize(label, 10);
    page.drawText(label, {
      x: sealBoxX + (sealBoxW - lw) / 2,
      y: sealBottom - 16,
      size: 10,
      font: bold,
      color: ink
    });
    sealBottom -= 16;
  }

  y = Math.min(y, sealBottom - 40);

  // Acceptance block — leave clear space under the Director seal (reference rhythm).
  ensure(150);
  y -= 12;
  {
    const acc = 'Acceptance of Offer';
    const accSize = 12;
    const aw = bold.widthOfTextAtSize(acc, accSize);
    const ax = (PAGE_W - aw) / 2;
    page.drawText(acc, { x: ax, y, size: accSize, font: bold, color: ink });
    page.drawLine({
      start: { x: ax, y: y - 3 },
      end: { x: ax + aw, y: y - 3 },
      thickness: 1,
      color: ink
    });
  }
  y -= 24;
  write('I have read and understood the terms of the Offer and hereby accept the same.', {
    size: 10, gap: 22
  });
  writeRich([
    { text: 'Name: ', bold: true },
    { text: fullName, bold: true }
  ], { size: 10, gap: 20 });
  let acceptancePlacement;
  {
    // Date (left) + Signature (right) on one line — reference acceptance block.
    const datePrefix = 'Date: ';
    const dateBlank = '____________________';
    const sigPrefix = 'Signature: ';
    const sigBlank = '___________________________';
    const dateLabel = datePrefix + dateBlank;
    const sigLabel = sigPrefix + sigBlank;
    page.drawText(dateLabel, { x: MARGIN_X, y, size: 10, font: bold, color: ink });
    const sw = bold.widthOfTextAtSize(sigLabel, 10);
    const sigLabelX = PAGE_W - MARGIN_X - sw;
    page.drawText(sigLabel, {
      x: sigLabelX,
      y,
      size: 10,
      font: bold,
      color: ink
    });
    const dateValueX = MARGIN_X + bold.widthOfTextAtSize(datePrefix, 10);
    const sigImageX = sigLabelX + bold.widthOfTextAtSize(sigPrefix, 10);
    // Image sits on the underscore blank, slightly above the text baseline.
    acceptancePlacement = {
      pageIndex,
      dateX: MARGIN_X,
      dateY: y,
      dateValueX,
      sigLabelX,
      sigImageX,
      sigImageY: y - 4
    };
  }

  const file = path.join(OFFER_DIR, `offer-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return { pdfFileUrl: relPath(file), acceptancePlacement };
};

/**
 * Bake a candidate's drawn signature (base64 PNG, optionally a data URL) onto
 * the offer PDF beside the Signature label, and fill the Date blank with the
 * signature date.
 * @returns {Promise<string>} repo-relative path to the signed file.
 */
export const bakeSignatureOnOffer = async (sourceRelPath, signatureBase64, { name, signedAt, acceptancePlacement } = {}) => {
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
  const pageIdx = Number.isInteger(acceptancePlacement?.pageIndex)
    ? Math.min(Math.max(acceptancePlacement.pageIndex, 0), pages.length - 1)
    : pages.length - 1;
  const page = pages[pageIdx];

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.12, 0.12, 0.14);

  // Prefer geometry captured at generation; fall back to right-side acceptance band.
  const dateY = acceptancePlacement?.dateY ?? 140;
  const dateValueX = acceptancePlacement?.dateValueX ?? (PAGE_MARGIN_X + bold.widthOfTextAtSize('Date: ', 10));
  const sigImageX = acceptancePlacement?.sigImageX
    ?? (PAGE_W - PAGE_MARGIN_X - bold.widthOfTextAtSize('___________________________', 10));
  const sigImageY = acceptancePlacement?.sigImageY ?? (dateY - 4);

  const signedDateStr = formatOfferDate(signedAt);

  // Cover the Date underscore blank, then write the signed date.
  page.drawRectangle({
    x: dateValueX - 1,
    y: dateY - 2,
    width: bold.widthOfTextAtSize('____________________', 10) + 2,
    height: 14,
    color: rgb(1, 1, 1)
  });
  page.drawText(ascii(signedDateStr), {
    x: dateValueX,
    y: dateY,
    size: 10,
    font: bold,
    color: ink
  });

  // Cover the Signature underscore, then draw the signature image on that blank.
  const dims = png.scaleToFit(150, 42);
  page.drawRectangle({
    x: sigImageX - 1,
    y: sigImageY - 2,
    width: Math.max(dims.width, bold.widthOfTextAtSize('___________________________', 10)) + 2,
    height: Math.max(dims.height, 16) + 4,
    color: rgb(1, 1, 1)
  });
  page.drawImage(png, {
    x: sigImageX,
    y: sigImageY,
    width: dims.width,
    height: dims.height
  });

  // Small caption under the acceptance line for audit trail.
  page.drawText(ascii(`Signed by ${name}`), {
    x: PAGE_MARGIN_X,
    y: Math.max(dateY - 16, 40),
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.38)
  });

  const file = path.join(SIGNED_OFFER_DIR, `signed-${crypto.randomUUID()}.pdf`);
  await fsp.writeFile(file, await doc.save());
  return relPath(file);
};


// --- Epic 10: company-sealed statutory document generation ---

/**
 * Generate a company-issued statutory document (appointment letter, NDA,
 * handbook acknowledgment, code of conduct) as a PDF on the company page
 * template, sealed with stamp + authorized-signatory signature when configured.
 *
 * @param {{ title, paragraphs:string[], company, employeeName, designation, effectiveDate }} args
 * @returns {Promise<string>} repo-relative path to the generated file.
 */
export const generateCompanyDocPdf = async ({ title, paragraphs, company, employeeName, designation, effectiveDate }) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const kit = await createCompanyPageKit(doc, company, { font, bold });
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.3, 0.3, 0.3);
  let { page, y } = kit.addDecoratedPage();

  const ensure = (need = 40) => {
    if (y < kit.contentBottomY + need) ({ page, y } = kit.addDecoratedPage());
  };
  const write = (s, opts = {}) => {
    const size = opts.size ?? 11;
    const f = opts.bold ? bold : font;
    const x = opts.x ?? kit.MARGIN_X;
    const maxChars = opts.maxChars ?? 92;
    const gap = opts.gap ?? 18;
    for (const ln of wrapText(s, maxChars)) {
      ensure(size + 8);
      page.drawText(ascii(ln), { x, y, size, font: f, color: opts.color || ink });
      y -= gap;
    }
  };

  write(String(title || 'Document').toUpperCase(), { size: 13, bold: true, gap: 22 });
  write(`Date: ${new Date(effectiveDate || Date.now()).toDateString()}`, { size: 10, gap: 16 });
  if (employeeName) {
    write(`To: ${employeeName}${designation ? `, ${designation}` : ''}`, { size: 10, gap: 20 });
  }

  for (const para of paragraphs || []) {
    write(para, { size: 10, gap: 14, maxChars: 90 });
    y -= 6;
  }

  ensure(200);
  const sealTop = y;
  const hrName = company?.hr?.name;
  if (hrName) {
    write(hrName, { size: 10, bold: true, gap: 14 });
    if (company.hr.designation) write(company.hr.designation, { size: 9, gap: 12 });
    if (company.hr.contact) write(company.hr.contact, { size: 9, gap: 12 });
    if (company.hr.email) write(company.hr.email, { size: 9, gap: 16 });
  }

  const logoWithStamp = await loadImage(doc, company?.branding?.logoWithStampUrl);
  const stamp = await loadImage(doc, company?.branding?.stampUrl);
  const sig = await loadImage(doc, company?.branding?.signatureUrl);
  const sealX = 400;
  let sealBottom = sealTop;
  if (logoWithStamp) {
    const d = logoWithStamp.scaleToFit(110, 110);
    page.drawImage(logoWithStamp, {
      x: sealX, y: sealTop - d.height, width: d.width, height: d.height, opacity: 0.95
    });
    sealBottom = sealTop - d.height;
  } else if (stamp) {
    const d = stamp.scaleToFit(100, 100);
    page.drawImage(stamp, {
      x: sealX + 10, y: sealTop - d.height, width: d.width, height: d.height, opacity: 0.9
    });
    sealBottom = sealTop - d.height;
  }
  if (sig) {
    const d = sig.scaleToFit(150, 50);
    const sy = Math.max(sealBottom + 16, sealTop - 70);
    page.drawImage(sig, { x: kit.MARGIN_X, y: sy, width: d.width, height: d.height });
  }
  const sigLineY = Math.min(y, sealBottom) - 10;
  page.drawLine({
    start: { x: kit.MARGIN_X, y: sigLineY },
    end: { x: kit.MARGIN_X + 180, y: sigLineY },
    thickness: 1,
    color: ink
  });
  page.drawText(ascii(`Authorized Signatory: ${company?.branding?.authorizedSignatoryName || ''}`), {
    x: kit.MARGIN_X, y: sigLineY - 14, size: 9, font, color: ink
  });
  if (company?.branding?.authorizedSignatoryDesignation) {
    page.drawText(ascii(company.branding.authorizedSignatoryDesignation), {
      x: kit.MARGIN_X, y: sigLineY - 28, size: 8, font, color: muted
    });
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

  const logoWithStamp = await loadImage(doc, company?.branding?.logoWithStampUrl);
  const stamp = await loadImage(doc, company?.branding?.stampUrl);
  if (logoWithStamp) {
    const d = logoWithStamp.scaleToFit(110, 110);
    page.drawImage(logoWithStamp, { x: 410, y: 70, width: d.width, height: d.height, opacity: 0.95 });
  } else if (stamp) {
    const d = stamp.scaleToFit(100, 100);
    page.drawImage(stamp, { x: 420, y: 80, width: d.width, height: d.height, opacity: 0.9 });
  }
  const sig = await loadImage(doc, company?.branding?.signatureUrl);
  if (sig) {
    const d = sig.scaleToFit(150, 50);
    page.drawImage(sig, { x: 40, y: 110, width: d.width, height: d.height });
  }
  if (company?.branding?.authorizedSignatoryName || sig || stamp || logoWithStamp) {
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

  // Type-specific fillable PDF only. Company letter outline is page chrome
  // (applied by generateCompanyDocPdf), not an AcroForm source.
  const sourceFile = template?.fileUrl || null;

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
  const kit = await createCompanyPageKit(doc, company, { font, bold });
  const ink = rgb(0.12, 0.12, 0.12);
  let { page, y } = kit.addDecoratedPage();

  const ensureSpace = (need = 40) => {
    if (y < kit.contentBottomY + need) ({ page, y } = kit.addDecoratedPage());
  };
  const write = (s, opts = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    ensureSpace(size + 20);
    page.drawText(ascii(s), { x: opts.x ?? kit.MARGIN_X, y, size, font: f, color: ink });
    y -= opts.gap ?? (size + 6);
  };

  write(title, { size: 12, bold: true, gap: 22 });

  for (const para of paragraphs) {
    if (/^\d+\. /.test(para) || para === 'AND') {
      y -= 6;
      write(para, { size: 10, bold: true, gap: 14 });
      continue;
    }
    for (const ln of wrapText(para, 90)) write(ln, { size: 10, gap: 13 });
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
