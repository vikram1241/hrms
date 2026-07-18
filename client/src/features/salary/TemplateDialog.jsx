import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import { Plus, Trash2 } from 'lucide-react';
import FormDialog from '../../components/ui/FormDialog.jsx';
import { createTemplate, updateTemplate } from '../../api/salary.js';
import { CALC_TYPES } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

/** Stable formula key from the human label (no UI key field). */
export const keyFromLabel = (label) => {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'field';
};

const ensureUniqueKeys = (rows) => {
  const seen = new Map();
  return rows.map((r) => {
    const base = keyFromLabel(r.label);
    let key = base;
    let n = 2;
    while (seen.has(key)) key = `${base}_${n++}`;
    seen.set(key, true);
    return { ...r, key };
  });
};

const emptyRow = () => ({
  label: '',
  calculationType: 'percentage_of_ctc',
  percent: '',
  amount: ''
});

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isBasicRow = (r) => {
  const k = keyFromLabel(r.label);
  return k === 'basic' || k === 'basic_pay' || /^basic/.test(k);
};

const basicAmountOf = (earnings) => {
  const row = (earnings || []).find(isBasicRow);
  return row ? num(row.amount) : 0;
};

const amountFromPercent = (type, percent, monthlyCtc, basicAmt) => {
  const p = num(percent);
  if (type === 'percentage_of_ctc' || type === 'fixed') return round2((monthlyCtc * p) / 100);
  if (type === 'percentage_of_basic') return round2((basicAmt * p) / 100);
  return 0;
};

const percentFromAmount = (type, amount, monthlyCtc, basicAmt) => {
  const a = num(amount);
  if (type === 'percentage_of_basic') {
    if (basicAmt <= 0) return 0;
    return round2((a / basicAmt) * 100);
  }
  if (monthlyCtc <= 0) return 0;
  return round2((a / monthlyCtc) * 100);
};

/** Apply % → amount for all rows given CTC / basic. */
const syncAmounts = (rows, monthlyCtc, basicAmt) =>
  (rows || []).map((r) => {
    if (r.calculationType === 'balance_of_ctc') return { ...r, percent: '', amount: '' };
    if (r.percent === '' || r.percent == null) return r;
    return {
      ...r,
      amount: amountFromPercent(r.calculationType, r.percent, monthlyCtc, basicAmt)
    };
  });

const rowsFromStructure = (structure) =>
  (structure || []).map((row) => {
    const type = row.calculationType || 'percentage_of_ctc';
    if (type === 'fixed') {
      const amount = round2(num(row.valueFactor) / 100);
      return { label: row.label || '', calculationType: type, percent: '', amount };
    }
    if (type === 'balance_of_ctc') {
      return { label: row.label || '', calculationType: type, percent: '', amount: '' };
    }
    return {
      label: row.label || '',
      calculationType: type,
      percent: num(row.valueFactor),
      amount: ''
    };
  });

function RowEditor({
  title,
  rows,
  onChange,
  monthlyCtc,
  basicAmt,
  canAdd,
  addHint
}) {
  const updateAt = (i, patch) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const onType = (i, calculationType) => {
    const r = rows[i];
    if (calculationType === 'balance_of_ctc') {
      return updateAt(i, { calculationType, percent: '', amount: '' });
    }
    let percent = r.percent;
    let amount = r.amount;
    if (percent !== '' && percent != null) {
      amount = amountFromPercent(calculationType, percent, monthlyCtc, basicAmt);
    } else if (amount !== '' && amount != null) {
      percent = percentFromAmount(calculationType, amount, monthlyCtc, basicAmt);
    }
    updateAt(i, { calculationType, percent, amount });
  };

  const onPercent = (i, raw) => {
    const r = rows[i];
    if (r.calculationType === 'balance_of_ctc') return;
    if (raw === '') return updateAt(i, { percent: '', amount: '' });
    const amount = amountFromPercent(r.calculationType, raw, monthlyCtc, basicAmt);
    updateAt(i, { percent: raw, amount });
  };

  const onAmount = (i, raw) => {
    const r = rows[i];
    if (r.calculationType === 'balance_of_ctc') return;
    if (raw === '') return updateAt(i, { amount: '', percent: '' });
    const percent = percentFromAmount(r.calculationType, raw, monthlyCtc, basicAmt);
    updateAt(i, { amount: raw, percent });
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={!canAdd}
          title={canAdd ? 'Add field' : addHint}
          onClick={() => onChange([...rows, emptyRow()])}
        >
          <Plus size={14} /> Add field
        </button>
      </div>
      {!canAdd && <p className="mb-2 text-xs text-amber-700">{addHint}</p>}
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-xs text-muted">
            No fields yet.{canAdd ? ' Click Add field to begin.' : ''}
          </p>
        )}
        {rows.map((r, i) => {
          const locked = r.calculationType === 'balance_of_ctc';
          const inputsDisabled = locked || monthlyCtc <= 0;
          return (
            <div key={i} className="grid grid-cols-12 items-start gap-2">
              <TextField
                className="col-span-3"
                size="small"
                label="Label"
                value={r.label}
                onChange={(e) => updateAt(i, { label: e.target.value })}
                required
              />
              <TextField
                className="col-span-3"
                size="small"
                select
                label="Type"
                value={r.calculationType}
                onChange={(e) => onType(i, e.target.value)}
              >
                {CALC_TYPES.map((c) => (
                  <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                className="col-span-2"
                size="small"
                type="number"
                label="%"
                value={r.percent}
                onChange={(e) => onPercent(i, e.target.value)}
                disabled={inputsDisabled}
                inputProps={{ min: 0, step: '0.01' }}
              />
              <TextField
                className="col-span-3"
                size="small"
                type="number"
                label="Amount (₹ / month)"
                value={r.amount}
                onChange={(e) => onAmount(i, e.target.value)}
                disabled={inputsDisabled}
                inputProps={{ min: 0, step: '0.01' }}
              />
              <IconButton
                className="col-span-1 mt-1"
                size="small"
                color="error"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                aria-label="Remove field"
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TemplateDialog({ open, template, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [annualCtc, setAnnualCtc] = useState('');
  const [earnings, setEarnings] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [saving, setSaving] = useState(false);

  const monthlyCtc = useMemo(() => {
    const annual = num(annualCtc);
    return annual > 0 ? annual / 12 : 0;
  }, [annualCtc]);

  const basicAmt = useMemo(() => basicAmountOf(earnings), [earnings]);
  const canAddFields = monthlyCtc > 0;

  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name || '');
      setDescription(template.description || '');
      setAnnualCtc('');
      setEarnings(rowsFromStructure(template.earningsStructure));
      setDeductions(rowsFromStructure(template.deductionsStructure));
    } else {
      setName('');
      setDescription('');
      setAnnualCtc('');
      setEarnings([]);
      setDeductions([]);
    }
  }, [open, template]);

  /** CTC entered → fill amounts from stored/entered percentages. */
  const applyCtc = (raw) => {
    setAnnualCtc(raw);
    const monthly = num(raw) > 0 ? num(raw) / 12 : 0;
    if (monthly <= 0) return;

    setEarnings((prev) => {
      // First pass: non-basic-% rows (so Basic amount exists), then % of Basic.
      const pass1 = syncAmounts(
        prev.map((r) => (r.calculationType === 'percentage_of_basic' ? r : r)),
        monthly,
        0
      ).map((r) => {
        if (r.calculationType === 'percentage_of_basic') return r;
        if (r.calculationType === 'fixed' && (r.percent === '' || r.percent == null) && r.amount !== '') {
          return { ...r, percent: percentFromAmount('fixed', r.amount, monthly, 0) };
        }
        if (r.percent === '' || r.percent == null) return r;
        return {
          ...r,
          amount: amountFromPercent(r.calculationType, r.percent, monthly, 0)
        };
      });
      const basic = basicAmountOf(pass1);
      return pass1.map((r) => {
        if (r.calculationType !== 'percentage_of_basic') return r;
        if (r.percent === '' || r.percent == null) return r;
        return {
          ...r,
          amount: amountFromPercent('percentage_of_basic', r.percent, monthly, basic)
        };
      });
    });

    setDeductions((prev) => {
      // basic from earnings state may be one tick behind; recompute from earnings after setState is async —
      // use current earnings + the CTC we just applied for % of CTC / fixed; for % of basic use current basicAmt.
      const basic = basicAmountOf(earnings);
      return prev.map((r) => {
        if (r.calculationType === 'balance_of_ctc') return r;
        if (r.calculationType === 'fixed' && (r.percent === '' || r.percent == null) && r.amount !== '') {
          return { ...r, percent: percentFromAmount('fixed', r.amount, monthly, basic) };
        }
        if (r.percent === '' || r.percent == null) return r;
        return {
          ...r,
          amount: amountFromPercent(r.calculationType, r.percent, monthly, basic)
        };
      });
    });
  };

  const setEarningsAndCascade = (next) => {
    const basic = basicAmountOf(next);
    const synced = next.map((r) => {
      if (r.calculationType !== 'percentage_of_basic') return r;
      if (r.percent === '' || r.percent == null) return r;
      return {
        ...r,
        amount: amountFromPercent('percentage_of_basic', r.percent, monthlyCtc, basic)
      };
    });
    setEarnings(synced);
    setDeductions((prev) => prev.map((r) => {
      if (r.calculationType !== 'percentage_of_basic') return r;
      if (r.percent === '' || r.percent == null) return r;
      return {
        ...r,
        amount: amountFromPercent('percentage_of_basic', r.percent, monthlyCtc, basic)
      };
    }));
  };

  const toStoredRow = (row) => {
    const type = row.calculationType;
    const label = String(row.label || '').trim();
    if (type === 'fixed') {
      return {
        key: keyFromLabel(label),
        label,
        calculationType: type,
        valueFactor: Math.round(num(row.amount) * 100)
      };
    }
    if (type === 'balance_of_ctc') {
      return { key: keyFromLabel(label), label, calculationType: type, valueFactor: 0 };
    }
    return {
      key: keyFromLabel(label),
      label,
      calculationType: type,
      valueFactor: num(row.percent)
    };
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canAddFields) {
      return dispatch(notifyError('Enter Annual CTC first, then add salary fields.'));
    }
    if (!earnings.length) {
      return dispatch(notifyError('Add at least one earning field.'));
    }
    if (
      earnings.some((r) => !String(r.label || '').trim())
      || deductions.some((r) => !String(r.label || '').trim())
    ) {
      return dispatch(notifyError('Every field needs a label.'));
    }

    setSaving(true);
    try {
      const body = {
        name,
        description,
        earningsStructure: ensureUniqueKeys(earnings.map(toStoredRow)),
        deductionsStructure: ensureUniqueKeys(deductions.map(toStoredRow))
      };
      if (template) await updateTemplate(template._id, body);
      else await createTemplate(body);
      dispatch(notifySuccess(`Template ${template ? 'updated' : 'created'}.`));
      onSaved?.();
      onClose();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      onSubmit={submit}
      loading={saving}
      maxWidth="md"
      title={template ? 'Edit Salary Model' : 'New Salary Model'}
      formId="template-form"
    >
      <div className="space-y-5 pt-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Template Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
          />
        </div>

        <div className="rounded-lg border border-primary-200 bg-orange-50/50 p-3">
          <p className="mb-2 text-sm font-semibold text-ink">1. Annual CTC (required first)</p>
          <p className="mb-3 text-xs text-muted">
            Enter CTC to unlock fields. % and monthly amount stay in sync (Annual ÷ 12).
            CTC is only used while building the model — it is not saved on the template.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Annual CTC (₹)"
              type="number"
              size="small"
              value={annualCtc}
              onChange={(e) => applyCtc(e.target.value)}
              required
              inputProps={{ min: 0, step: '1000' }}
              fullWidth
            />
            <TextField
              label="Monthly CTC (₹)"
              size="small"
              value={monthlyCtc > 0 ? round2(monthlyCtc).toLocaleString('en-IN') : '—'}
              InputProps={{ readOnly: true }}
              fullWidth
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">2. Structure fields</p>
          <RowEditor
            title="Earnings"
            rows={earnings}
            onChange={setEarningsAndCascade}
            monthlyCtc={monthlyCtc}
            basicAmt={basicAmt}
            canAdd={canAddFields}
            addHint="Enter Annual CTC above before adding fields."
          />
        </div>

        <RowEditor
          title="Deductions"
          rows={deductions}
          onChange={setDeductions}
          monthlyCtc={monthlyCtc}
          basicAmt={basicAmt}
          canAdd={canAddFields}
          addHint="Enter Annual CTC above before adding fields."
        />

        <p className="text-xs text-muted">
          Tip: use one <strong>Balance of CTC</strong> earning (e.g. Special Allowance) so earnings
          always reconcile to monthly CTC. Field keys are generated from labels automatically.
        </p>
      </div>
    </FormDialog>
  );
}
