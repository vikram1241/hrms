/**
 * Parse Mirus-style monthly staff attendance workbooks (.xls / .xlsx).
 *
 * Layout (per sheet):
 *   R1  Title containing "MONTH OF <MONTH> <YEAR>"
 *   R2  Headers: S.No. | Emp.Id | Name | Contact No. | weekdays… | PD | AD | TD
 *   R3  Day-of-month numbers under the weekday columns (1..31)
 *   R4+ Employee rows with P / A / L / empty per day
 *
 * Empty day cells are omitted (not imported).
 */

import * as XLSX from 'xlsx';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12
};

const STATUS_MAP = {
  P: 'Present',
  A: 'Absent',
  L: 'Leave'
};

const norm = (v) => String(v ?? '').trim();
const normUpper = (v) => norm(v).toUpperCase();
const digitsOnly = (v) => String(v ?? '').replace(/\D/g, '');

const cellStr = (row, idx) => {
  if (!row || idx == null || idx < 0) return '';
  const v = row[idx];
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Day numbers / serials as integers when whole
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  return String(v).trim();
};

/** True when a sheet looks like the Mirus staff attendance matrix. */
export const isMirusAttendanceSheet = (rows) => {
  if (!Array.isArray(rows) || rows.length < 4) return false;
  const header = (rows[1] || []).map((c) => norm(c).toLowerCase());
  const hasEmp = header.some((h) => /emp\.?\s*id|employee\s*id/.test(h));
  const hasName = header.some((h) => /name/.test(h));
  const dayRow = rows[2] || [];
  const dayNums = dayRow.filter((c) => {
    const n = Number(c);
    return Number.isInteger(n) && n >= 1 && n <= 31;
  });
  return hasEmp && hasName && dayNums.length >= 7;
};

const parseMonthYear = (title, sheetName) => {
  const titleStr = String(title || '');
  const yearMatch = titleStr.match(/\b(20\d{2})\b/) || String(sheetName || '').match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  // Prefer sheet tab name when it is a month (JULY / AUGUST) — title text is often copy-pasted wrong.
  const sheetMonth = MONTHS[norm(sheetName).toLowerCase()];
  if (sheetMonth && year) return { month: sheetMonth, year };

  const m1 = titleStr.match(/month\s+of\s+([A-Za-z]+)\s+(\d{4})/i);
  if (m1) {
    const month = MONTHS[m1[1].toLowerCase()];
    const y = Number(m1[2]);
    if (month && y) return { month, year: y };
  }
  const m2 = titleStr.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b[\s,-]*(\d{4})/i);
  if (m2) {
    const month = MONTHS[m2[1].toLowerCase()];
    const y = Number(m2[2]);
    if (month && y) return { month, year: y };
  }
  if (sheetMonth) return { month: sheetMonth, year };
  return null;
};

const findCol = (headerRow, predicators) => {
  for (let i = 0; i < headerRow.length; i += 1) {
    const h = norm(headerRow[i]).toLowerCase();
    if (predicators.some((re) => re.test(h))) return i;
  }
  return -1;
};

/**
 * Parse one Mirus matrix sheet into attendance marks.
 * @returns {{ marks: object[], skippedEmpty: number, errors: object[], meta: object }}
 */
export const parseMirusAttendanceSheet = (rows, sheetName = '') => {
  const marks = [];
  const errors = [];
  let skippedEmpty = 0;

  if (!isMirusAttendanceSheet(rows)) {
    return { marks, skippedEmpty, errors: [{ sheet: sheetName, error: 'Not a Mirus attendance sheet' }], meta: null };
  }

  const title = cellStr(rows[0], 0);
  const header = rows[1] || [];
  const dayRow = rows[2] || [];
  let { month, year } = parseMonthYear(title, sheetName) || {};
  if (!month || !year) {
    errors.push({ sheet: sheetName, error: 'Could not determine month/year from sheet title' });
    return { marks, skippedEmpty, errors, meta: null };
  }

  const empCol = findCol(header, [/^emp\.?\s*id$/, /employee\s*id/, /^emp\s*id/]);
  const nameCol = findCol(header, [/name of the employee/, /^name$/, /employee\s*name/]);
  const phoneCol = findCol(header, [/contact/, /phone/, /mobile/]);

  if (empCol < 0) {
    errors.push({ sheet: sheetName, error: 'Emp.Id column not found' });
    return { marks, skippedEmpty, errors, meta: null };
  }

  // Map column index → day of month (1..31), skip PD/AD/TD and non-day headers
  const dayCols = [];
  for (let c = 0; c < dayRow.length; c += 1) {
    const hdr = norm(header[c]).toUpperCase();
    if (['PD', 'AD', 'TD', 'S.NO.', 'S.NO', 'EMP.ID', 'NAME'].includes(hdr)) continue;
    if (/present|absent|total|contact|phone|name|emp/i.test(hdr) && !/^(mon|tue|wed|thu|fri|sat|sun)/i.test(hdr)) {
      // keep weekday headers; skip summary labels already handled
    }
    const day = Number(dayRow[c]);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    // Validate calendar day for month
    const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > dim) continue;
    dayCols.push({ col: c, day });
  }

  if (!dayCols.length) {
    errors.push({ sheet: sheetName, error: 'No day-number columns found on row 3' });
    return { marks, skippedEmpty, errors, meta: { month, year } };
  }

  for (let r = 3; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const empId = normUpper(cellStr(row, empCol));
    // Placeholder rows often have only S.No. — skip when Emp.Id is empty
    if (!empId) continue;

    const name = nameCol >= 0 ? cellStr(row, nameCol) : '';
    const phone = phoneCol >= 0 ? cellStr(row, phoneCol) : '';

    for (const { col, day } of dayCols) {
      const raw = normUpper(cellStr(row, col));
      if (!raw) {
        skippedEmpty += 1;
        continue;
      }
      const status = STATUS_MAP[raw];
      if (!status) {
        errors.push({
          sheet: sheetName,
          row: r + 1,
          empId,
          day,
          error: `Unknown mark "${raw}" (use P, A, or L)`
        });
        continue;
      }
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      marks.push({
        sheet: sheetName,
        row: r + 1,
        empId,
        name,
        phone,
        phoneDigits: digitsOnly(phone),
        dateKey,
        date: new Date(`${dateKey}T00:00:00.000Z`),
        status
      });
    }
  }

  return {
    marks,
    skippedEmpty,
    errors,
    meta: { month, year, sheet: sheetName, dayColumns: dayCols.length }
  };
};

/**
 * Read a workbook buffer and extract Mirus attendance marks from every matching sheet.
 * @returns {{ format: 'mirus', marks, skippedEmpty, errors, sheets }}
 */
export const parseMirusAttendanceWorkbook = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const allMarks = [];
  const allErrors = [];
  let skippedEmpty = 0;
  const sheets = [];

  for (const sheetName of wb.SheetNames) {
    const sh = wb.Sheets[sheetName];
    if (!sh) continue;
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    if (!isMirusAttendanceSheet(rows)) continue;
    const parsed = parseMirusAttendanceSheet(rows, sheetName);
    sheets.push(parsed.meta);
    allMarks.push(...parsed.marks);
    allErrors.push(...parsed.errors);
    skippedEmpty += parsed.skippedEmpty;
  }

  if (!sheets.length) {
    return { format: null, marks: [], skippedEmpty: 0, errors: [], sheets: [] };
  }

  return {
    format: 'mirus',
    marks: allMarks,
    skippedEmpty,
    errors: allErrors,
    sheets
  };
};

/** Normalize phone for matching stored mobiles. */
export const normalizePhoneDigits = digitsOnly;
