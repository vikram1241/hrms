import { percentOfPaisa } from './money.js';
import ApiError from './ApiError.js';

/**
 * Compute one structure block (earnings OR deductions) into resolved line
 * items. All amounts are in paisa.
 *
 * Resolution order (within a block):
 *   1. fixed / percentage_of_ctc           — independent
 *   2. percentage_of_basic                  — needs the resolved basic
 *   3. balance_of_ctc                       — absorbs the remaining CTC
 *
 * @param {Array} fields           structure fields from the template
 * @param {number} monthlyCTC      monthly CTC in paisa
 * @param {number} basicAmount     resolved monthly basic in paisa (for deductions, the EARNINGS basic)
 */
const computeBlock = (fields = [], monthlyCTC, basicAmount) => {
  const amounts = new Map();

  // Pass 1 — independent fields.
  for (const f of fields) {
    if (f.calculationType === 'fixed') {
      amounts.set(f.key, Math.round(f.valueFactor));
    } else if (f.calculationType === 'percentage_of_ctc') {
      amounts.set(f.key, percentOfPaisa(monthlyCTC, f.valueFactor));
    }
  }

  // The block's own "basic" (if present) overrides the passed-in reference.
  const localBasic = amounts.has('basic') ? amounts.get('basic') : basicAmount;

  // Pass 2 — percentage_of_basic.
  for (const f of fields) {
    if (f.calculationType === 'percentage_of_basic') {
      amounts.set(f.key, percentOfPaisa(localBasic, f.valueFactor));
    }
  }

  // Pass 3 — balance_of_ctc (only meaningful for earnings).
  for (const f of fields) {
    if (f.calculationType === 'balance_of_ctc') {
      const allocated = [...amounts.values()].reduce((s, v) => s + v, 0);
      amounts.set(f.key, Math.max(monthlyCTC - allocated, 0));
    }
  }

  // Preserve declared order in the output.
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    monthlyAmount: amounts.get(f.key) ?? 0
  }));
};

const sum = (items) => items.reduce((s, i) => s + i.monthlyAmount, 0);

/**
 * When fixed/% earnings leave a gap vs monthly CTC (and the template has no
 * balance_of_ctc field), append a separate balancing line so Gross === monthly CTC.
 *
 * Never mutate existing lines — fixed amounts (e.g. Phone Allowance ₹500) must
 * stay exactly as configured in the salary template.
 */
export const reconcileEarningsToCtc = (earnings, monthlyCTC) => {
  const lines = (earnings || []).map((e) => ({ ...e, monthlyAmount: Number(e.monthlyAmount) || 0 }));
  const gross = sum(lines);
  const gap = Math.round(Number(monthlyCTC) || 0) - gross;
  if (gap <= 0) return { earnings: lines, grossEarnings: gross };

  const already = lines.findIndex((e) => e.key === 'balancing_allowance');
  if (already >= 0) {
    lines[already] = {
      ...lines[already],
      monthlyAmount: lines[already].monthlyAmount + gap
    };
  } else {
    lines.push({
      key: 'balancing_allowance',
      label: 'Balancing Allowance',
      monthlyAmount: gap
    });
  }
  return { earnings: lines, grossEarnings: Math.round(Number(monthlyCTC) || 0) };
};

/**
 * Compute a frozen monthly salary breakdown for an employee from a template
 * and an annual CTC (both monetary inputs in paisa).
 *
 * Invariant: grossEarnings === monthly CTC (when CTC ≥ allocated earnings).
 * Net take-home = grossEarnings − Σ deductions (once).
 *
 * @returns {{earnings, deductions, grossEarnings, totalDeductions, netTakeHome}}
 */
export const computeBreakdown = (template, annualCTCPaisa) => {
  if (!template) throw new ApiError(400, 'Salary template is required');
  if (!Number.isFinite(annualCTCPaisa) || annualCTCPaisa <= 0) {
    throw new ApiError(400, 'annualCTC must be a positive amount');
  }

  const monthlyCTC = Math.round(annualCTCPaisa / 12);

  let earnings = computeBlock(template.earningsStructure, monthlyCTC, 0);
  const hasBalance = (template.earningsStructure || []).some(
    (f) => f.calculationType === 'balance_of_ctc'
  );
  if (!hasBalance) {
    ({ earnings } = reconcileEarningsToCtc(earnings, monthlyCTC));
  }

  const basic = earnings.find((e) => e.key === 'basic' || /^basic/i.test(e.key || e.label || ''))
    ?.monthlyAmount ?? 0;
  const deductions = computeBlock(template.deductionsStructure, monthlyCTC, basic);

  const grossEarnings = sum(earnings);
  const totalDeductions = sum(deductions);
  const netTakeHome = grossEarnings - totalDeductions;

  return { earnings, deductions, grossEarnings, totalDeductions, netTakeHome };
};
