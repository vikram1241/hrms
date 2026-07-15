import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormDialog from '../../components/ui/FormDialog.jsx';
import CurrencyField from '../../components/ui/CurrencyField.jsx';
import { createOffer } from '../../api/offers.js';
import { listTemplates } from '../../api/salary.js';
import { DEPARTMENTS } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const blank = {
  candidateEmail: '', fullName: '', position: '', department: '',
  joiningDate: '', offerDate: '', templateId: '', annualCTC: '',
  phone: '', city: '', location: ''
};

export default function CreateOfferDialog({ open, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState(blank);
  const [templates, setTemplates] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(blank);
    listTemplates({ activeOnly: true }).then(setTemplates).catch(() => {});
  }, [open]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, annualCTC: Number(form.annualCTC) };
      if (!payload.offerDate) delete payload.offerDate;
      if (!payload.phone) delete payload.phone;
      if (!payload.city) delete payload.city;
      if (!payload.location) delete payload.location;
      const res = await createOffer(payload);
      dispatch(notifySuccess('Offer staged and emailed to the candidate.'));
      onSaved?.(res);
      onClose();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog open={open} onClose={onClose} onSubmit={submit} loading={saving} maxWidth="sm"
      title="Create Offer Letter" subtitle="Stage and email a single candidate offer" submitLabel="Create & Send" formId="create-offer-form">
      <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
        <TextField label="Full Name" value={form.fullName} onChange={set('fullName')} fullWidth required />
        <TextField label="Candidate Email" type="email" value={form.candidateEmail} onChange={set('candidateEmail')} fullWidth required />
        <TextField label="Phone" value={form.phone} onChange={set('phone')} fullWidth />
        <TextField label="City / Address" value={form.city} onChange={set('city')} fullWidth placeholder="e.g. Hyderabad, PIN Code: 500090" />
        <TextField label="Position" value={form.position} onChange={set('position')} fullWidth required />
        <TextField label="Job Location" value={form.location} onChange={set('location')} fullWidth placeholder="e.g. Hyderabad, Telangana" />
        <TextField label="Department" value={form.department} onChange={set('department')} select fullWidth required>
          {DEPARTMENTS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
        </TextField>
        <TextField label="Joining Date" type="date" value={form.joiningDate} onChange={set('joiningDate')} fullWidth required InputLabelProps={{ shrink: true }} />
        <TextField label="Offer Date" type="date" value={form.offerDate} onChange={set('offerDate')} fullWidth InputLabelProps={{ shrink: true }} helperText="Defaults to today" />
        <TextField label="Salary Template" value={form.templateId} onChange={set('templateId')} select fullWidth required>
          {templates.map((t) => <MenuItem key={t._id} value={t._id}>{t.name}</MenuItem>)}
        </TextField>
        <CurrencyField value={form.annualCTC} onChange={(v) => setForm({ ...form, annualCTC: v })} required />
      </div>
    </FormDialog>
  );
}
