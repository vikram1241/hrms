import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import useAsync from '../../hooks/useAsync.js';
import { listUsers } from '../../api/users.js';

const fullName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email;

/** A select of employees in the company. Value/onChange work on the user id. */
export default function EmployeeSelect({ value, onChange, label = 'Employee', size = 'small', roles }) {
  const { data } = useAsync(() => listUsers({ limit: 100 }), []);
  const users = (data?.data || []).filter((u) => (roles ? roles.includes(u.role) : true));
  return (
    <TextField select fullWidth size={size} label={label} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <MenuItem value="">Select…</MenuItem>
      {users.map((u) => (
        <MenuItem key={u._id} value={u._id}>{fullName(u)}{u.employeeDetails?.employeeId ? ` (${u.employeeDetails.employeeId})` : ''}</MenuItem>
      ))}
    </TextField>
  );
}
