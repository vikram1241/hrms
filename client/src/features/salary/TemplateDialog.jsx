import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import { Plus, Trash2 } from 'lucide-react';
import FormDialog from '../../components/ui/FormDialog.jsx';
import { createTemplate, updateTemplate } from '../../api/salary.js';
import { CALC_TYPES } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const emptyRow = () => ({ key: '', label: '', calculationType: 'percentage_of_ctc', valueFactor: 0 });

// `fixed` valueFactor is entered in rupees for UX, converted to paisa on save.
const toPaisaIfFixed = (row) => ({
  ...row,
  key: row.key.trim().toLowerCase(),
  valueFactor: row.calculationType === 'fixed' ? Math.round(Number(row.valueFactor) * 100) : Number(row.valueFactor)
});
const fromPaisaIfFixed = (row) => ({
  ...row,
  valueFactor: row.calculationType === 'fixed' ? Number(row.valueFactor) / 100 : row.valueFactor
});

function RowEditor({ title, rows, setRows }) {
  const update = (i, k, v) => setRows(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setRows([...rows, emptyRow()])}>
          <Plus size={14} /> Add Row
        </button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted">No rows yet.</p>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <TextField className="col-span-3" size="small" label="Key" value={r.key} onChange={(e) => update(i, 'key', e.target.value)} required />
            <TextField className="col-span-3" size="small" label="Label" value={r.label} onChange={(e) => update(i, 'label', e.target.value)} required />
            <TextField className="col-span-3" size="small" select label="Type" value={r.calculationType} onChange={(e) => update(i, 'calculationType', e.target.value)}>
              {CALC_TYPES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
            </TextField>
            <TextField className="col-span-2" size="small" type="number" label={r.calculationType === 'fixed' ? '₹' : '%'} value={r.valueFactor}
              onChange={(e) => update(i, 'valueFactor', e.target.value)} disabled={r.calculationType === 'balance_of_ctc'} />
            <IconButton className="col-span-1" size="small" color="error" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}><Trash2 size={16} /></IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TemplateDialog({ open, template, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [earnings, setEarnings] = useState([emptyRow()]);
  const [deductions, setDeductions] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name || '');
      setDescription(template.description || '');
      setEarnings((template.earningsStructure || []).map(fromPaisaIfFixed));
      setDeductions((template.deductionsStructure || []).map(fromPaisaIfFixed));
    } else {
      setName(''); setDescription('');
      setEarnings([{ key: 'basic', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 45 }]);
      setDeductions([{ key: 'pf', label: 'Provident Fund', calculationType: 'percentage_of_basic', valueFactor: 12 }]);
    }
  }, [open, template]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name, description,
        earningsStructure: earnings.map(toPaisaIfFixed),
        deductionsStructure: deductions.map(toPaisaIfFixed)
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
    <FormDialog open={open} onClose={onClose} onSubmit={submit} loading={saving} maxWidth="md"
      title={template ? 'Edit Salary Model' : 'New Salary Model'} formId="template-form">
      <div className="space-y-5 pt-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Template Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
        </div>
        <RowEditor title="Earnings Structure" rows={earnings} setRows={setEarnings} />
        <RowEditor title="Deductions Structure" rows={deductions} setRows={setDeductions} />
        <p className="text-xs text-muted">Tip: use one <strong>Balance of CTC</strong> earning (e.g. Special Allowance) so earnings always reconcile to the monthly CTC.</p>
      </div>
    </FormDialog>
  );
}
