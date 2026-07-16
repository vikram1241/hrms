import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import FormDialog from '../../components/ui/FormDialog.jsx';
import JobRoleSelect from '../../components/feature/JobRoleSelect.jsx';
import { updateUser } from '../../api/users.js';
import { DEPARTMENTS, ROLES, fullName } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../../features/ui/toastSlice.js';

export default function EditUserDialog({ open, user, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.personalDetails?.firstName || '',
      lastName: user.personalDetails?.lastName || '',
      phone: user.contactInfo?.personalMobile || '',
      role: user.role || 'employee',
      department: user.employeeDetails?.department || '',
      designation: user.employeeDetails?.designation || '',
      employeeId: user.employeeDetails?.employeeId || '',
      isActive: Boolean(user.isActive)
    });
  }, [user]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.department) delete payload.department; // avoid enum error on empty
      await updateUser(user._id, payload);
      dispatch(notifySuccess('User updated.'));
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
      open={open} onClose={onClose} onSubmit={submit} loading={saving}
      title="Edit User" subtitle={user ? fullName(user) : ''} formId="edit-user-form"
    >
      <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
        <TextField label="First Name" value={form.firstName || ''} onChange={set('firstName')} fullWidth required />
        <TextField label="Last Name" value={form.lastName || ''} onChange={set('lastName')} fullWidth required />
        <TextField label="Phone" value={form.phone || ''} onChange={set('phone')} fullWidth />
        <TextField label="Employee ID" value={form.employeeId || ''} onChange={set('employeeId')} fullWidth />
        <TextField label="Role" value={form.role || ''} onChange={set('role')} select fullWidth>
          {ROLES.map((r) => <MenuItem key={r} value={r} sx={{ textTransform: 'capitalize' }}>{r}</MenuItem>)}
        </TextField>
        <TextField label="Department" value={form.department || ''} onChange={set('department')} select fullWidth>
          <MenuItem value="">—</MenuItem>
          {DEPARTMENTS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
        </TextField>
        <JobRoleSelect
          value={form.designation || ''}
          onChange={(v) => setForm({ ...form, designation: v })}
          className="sm:col-span-2"
          size="medium"
        />
      </div>
      <FormControlLabel
        sx={{ mt: 1 }}
        control={<Switch checked={Boolean(form.isActive)} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
        label="Active account"
      />
    </FormDialog>
  );
}
