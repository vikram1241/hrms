import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { CalendarDays, Check, X, Plus, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listLeaves, decideLeave, markAttendance, listHolidays, createHoliday, deleteHoliday } from '../../api/attendance.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATUSES = ['Present', 'Absent', 'Half-Day', 'Leave', 'WeekOff', 'Holiday'];

export default function AttendanceAdminPage() {
  const dispatch = useDispatch();
  const leaves = useAsync(() => listLeaves({ status: 'Pending' }), []);
  const holidays = useAsync(() => listHolidays({ year: new Date().getFullYear() }), []);
  const [att, setAtt] = useState({ userId: '', date: today(), status: 'Present' });
  const [hol, setHol] = useState({ date: today(), name: '' });

  const decide = async (id, status) => {
    try { await decideLeave(id, { status }); dispatch(notifySuccess(`Leave ${status.toLowerCase()}.`)); leaves.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const saveAtt = async () => {
    if (!att.userId) return dispatch(notifyError('Select an employee.'));
    try { await markAttendance(att); dispatch(notifySuccess('Attendance recorded.')); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
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
      <PageHeader title="Attendance & Leave" subtitle="Approve leave, record attendance and manage holidays" />

      <Card className="mb-4"><CardBody>
        <h3 className="mb-3 text-base font-semibold text-ink">Pending leave approvals</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="pb-2">Type</th><th className="pb-2">From</th><th className="pb-2">To</th><th className="pb-2">Days</th><th className="pb-2">Reason</th><th className="pb-2 text-right">Action</th></tr></thead>
          <tbody>
            {(leaves.data || []).map((l) => (
              <tr key={l._id} className="border-t border-line">
                <td className="py-2">{l.type}</td><td className="py-2">{fmt(l.fromDate)}</td><td className="py-2">{fmt(l.toDate)}</td>
                <td className="py-2">{l.days}</td><td className="py-2 text-muted">{l.reason || '—'}</td>
                <td className="py-2 text-right">
                  <button className="btn-ghost p-1.5 text-success" onClick={() => decide(l._id, 'Approved')} title="Approve"><Check size={16} /></button>
                  <button className="btn-ghost p-1.5 text-danger" onClick={() => decide(l._id, 'Rejected')} title="Reject"><X size={16} /></button>
                </td>
              </tr>
            ))}
            {!leaves.data?.length && <tr><td colSpan={6} className="py-6 text-center text-muted">No pending requests.</td></tr>}
          </tbody>
        </table>
      </CardBody></Card>

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
