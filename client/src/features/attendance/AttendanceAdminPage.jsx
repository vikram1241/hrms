import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import { CalendarDays, Plus, Trash2, Users, Upload, Download } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listUsers } from '../../api/users.js';
import { fullName } from '../../config/constants.js';
import { markAttendance, markBulkAttendance, bulkUploadAttendance, listHolidays, createHoliday, deleteHoliday } from '../../api/attendance.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';
import AttendanceRegister from './AttendanceRegister.jsx';
import LeavesRegister from './LeavesRegister.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATUSES = ['Present', 'Absent', 'Half-Day', 'Leave', 'WeekOff', 'Holiday'];

export default function AttendanceAdminPage() {
  const dispatch = useDispatch();
  const holidays = useAsync(() => listHolidays({ year: new Date().getFullYear() }), []);
  const { data: usersResp } = useAsync(() => listUsers({ limit: 200, role: 'employee', status: 'active', employeesOnly: true }), []);
  const employees = usersResp?.data || [];
  const [att, setAtt] = useState({ userId: '', date: today(), status: 'Present' });
  const [bulk, setBulk] = useState({ userIds: [], date: today(), status: 'Present' });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [hol, setHol] = useState({ date: today(), name: '' });
  const [registerKey, setRegisterKey] = useState(0);

  const saveAtt = async () => {
    if (!att.userId) return dispatch(notifyError('Select an employee.'));
    try {
      await markAttendance(att);
      dispatch(notifySuccess('Attendance recorded.'));
      setRegisterKey((k) => k + 1);
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const saveBulk = async () => {
    if (!bulk.userIds.length) return dispatch(notifyError('Select at least one employee.'));
    setBulkBusy(true);
    try {
      const res = await markBulkAttendance(bulk);
      dispatch(notifySuccess(res.message || 'Bulk attendance recorded.'));
      setBulk({ ...bulk, userIds: [] });
      setRegisterKey((k) => k + 1);
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBulkBusy(false); }
  };
  const allSelected = employees.length > 0 && bulk.userIds.length === employees.length;
  const toggleAll = () => setBulk({ ...bulk, userIds: allSelected ? [] : employees.map((e) => e._id) });

  const importXlsx = async (file) => {
    if (!file) return;
    setBulkBusy(true);
    try {
      const res = await bulkUploadAttendance(file);
      dispatch(notifySuccess(res.message || 'Attendance imported.'));
      if (res.failed?.length) dispatch(notifyError(`${res.failed.length} row(s) failed — check employee IDs.`));
      setRegisterKey((k) => k + 1);
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBulkBusy(false); }
  };
  const saveHol = async () => {
    if (!hol.name) return dispatch(notifyError('Enter a holiday name.'));
    try { await createHoliday(hol); dispatch(notifySuccess('Holiday saved.')); setHol({ date: today(), name: '' }); holidays.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const removeHol = async (id) => {
    try { await deleteHoliday(id); holidays.reload(); } catch (err) { dispatch(notifyError(err.uiMessage)); }
  };

  return (
    <div>
      <PageHeader title="Attendance & Leave" subtitle="Month/week register, leave filters, mark attendance and holidays" />

      <AttendanceRegister key={`att-${registerKey}`} employees={employees} />
      <LeavesRegister
        key={`lv-${registerKey}`}
        onDecided={(status) => {
          dispatch(notifySuccess(`Leave ${status.toLowerCase()}.`));
          setRegisterKey((k) => k + 1);
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Record attendance</h3>
          <div className="space-y-3">
            <EmployeeSelect value={att.userId} onChange={(v) => setAtt({ ...att, userId: v })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField type="date" size="small" label="Date" InputLabelProps={{ shrink: true }} value={att.date} onChange={(e) => setAtt({ ...att, date: e.target.value })} />
              <TextField select size="small" label="Status" value={att.status} onChange={(e) => setAtt({ ...att, status: e.target.value })}>
                {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </div>
            <Button onClick={saveAtt}>Save attendance</Button>
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><Users size={18} className="text-primary-600" /> Bulk attendance</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <TextField type="date" size="small" label="Date" InputLabelProps={{ shrink: true }} value={bulk.date} onChange={(e) => setBulk({ ...bulk, date: e.target.value })} />
              <TextField select size="small" label="Status" value={bulk.status} onChange={(e) => setBulk({ ...bulk, status: e.target.value })}>
                {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </div>
            <FormControl fullWidth size="small">
              <InputLabel id="bulk-emp-label">Employees</InputLabel>
              <Select
                labelId="bulk-emp-label" label="Employees" multiple value={bulk.userIds}
                onChange={(e) => setBulk({ ...bulk, userIds: e.target.value })}
                renderValue={(sel) => `${sel.length} selected`}
              >
                {employees.map((u) => (
                  <MenuItem key={u._id} value={u._id}>
                    <Checkbox size="small" checked={bulk.userIds.includes(u._id)} />
                    <ListItemText primary={fullName(u)} secondary={u.employeeDetails?.employeeId} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <div className="flex items-center justify-between">
              <button type="button" className="text-xs font-medium text-primary-600 hover:underline" onClick={toggleAll}>
                {allSelected ? 'Clear selection' : 'Select all employees'}
              </button>
              <Button onClick={saveBulk} loading={bulkBusy}>Mark {bulk.userIds.length || ''} attendance</Button>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-3 text-xs">
              <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary-600 hover:underline">
                <Upload size={13} /> Import from Excel
                <input type="file" accept=".xlsx,.xls" hidden onChange={(e) => { importXlsx(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <a className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600" href="/samples/bulk-attendance-sample.xlsx" download>
                <Download size={13} /> Sample .xlsx
              </a>
            </div>
          </div>
        </CardBody></Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><CalendarDays size={18} className="text-primary-600" /> Holiday calendar</h3>
          <div className="mb-3 flex items-end gap-2">
            <TextField type="date" size="small" label="Date" InputLabelProps={{ shrink: true }} value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
            <TextField size="small" label="Name" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
            <Button size="sm" onClick={saveHol}><Plus size={14} /> Add</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {(holidays.data || []).map((h) => (
              <li key={h._id} className="flex items-center justify-between border-t border-line py-2">
                <span><span className="font-medium text-ink">{h.name}</span> <span className="text-muted">— {fmt(h.date)}</span></span>
                <button className="btn-ghost p-1 text-danger" onClick={() => removeHol(h._id)}><Trash2 size={14} /></button>
              </li>
            ))}
            {!holidays.data?.length && <li className="py-4 text-center text-muted">No holidays set.</li>}
          </ul>
        </CardBody></Card>
      </div>
    </div>
  );
}
