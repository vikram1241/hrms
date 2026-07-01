import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { CalendarCheck, Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import useAsync from '../../hooks/useAsync.js';
import { markMyAttendance, myAttendance, applyLeave, myLeaves } from '../../api/attendance.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATUSES = ['Present', 'Absent', 'Half-Day', 'WeekOff'];
const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Other'];

export default function MyAttendancePage() {
  const dispatch = useDispatch();
  const att = useAsync(myAttendance, []);
  const leaves = useAsync(myLeaves, []);
  const [status, setStatus] = useState('Present');
  const [marking, setMarking] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: 'Casual', fromDate: today(), toDate: today(), reason: '' });
  const [saving, setSaving] = useState(false);

  const mark = async () => {
    setMarking(true);
    try {
      await markMyAttendance({ date: today(), status });
      dispatch(notifySuccess('Attendance marked for today.'));
      att.reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setMarking(false); }
  };

  const submitLeave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await applyLeave(leaveForm);
      dispatch(notifySuccess('Leave request submitted.'));
      setLeaveOpen(false);
      leaves.reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader title="Attendance & Leave" subtitle="Mark your attendance and request leave"
        actions={<Button onClick={() => setLeaveOpen(true)}><Plus size={16} /> Apply for leave</Button>} />

      <Card className="mb-4"><CardBody>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-ink"><CalendarCheck size={18} className="text-primary-600" /><span className="font-semibold">Mark today ({fmt(today())})</span></div>
          <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <Button onClick={mark} loading={marking}>Mark attendance</Button>
        </div>
      </CardBody></Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Recent attendance</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="pb-2">Date</th><th className="pb-2">Status</th></tr></thead>
            <tbody>
              {(att.data || []).map((r) => (
                <tr key={r._id} className="border-t border-line"><td className="py-2">{fmt(r.date)}</td><td className="py-2"><StatusBadge status={r.status} /></td></tr>
              ))}
              {!att.data?.length && <tr><td colSpan={2} className="py-6 text-center text-muted">No attendance yet.</td></tr>}
            </tbody>
          </table>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">My leave requests</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="pb-2">Type</th><th className="pb-2">From</th><th className="pb-2">To</th><th className="pb-2">Status</th></tr></thead>
            <tbody>
              {(leaves.data || []).map((l) => (
                <tr key={l._id} className="border-t border-line">
                  <td className="py-2">{l.type}</td><td className="py-2">{fmt(l.fromDate)}</td><td className="py-2">{fmt(l.toDate)}</td>
                  <td className="py-2"><StatusBadge status={l.status} /></td>
                </tr>
              ))}
              {!leaves.data?.length && <tr><td colSpan={4} className="py-6 text-center text-muted">No leave requests.</td></tr>}
            </tbody>
          </table>
        </CardBody></Card>
      </div>

      <FormDialog open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Apply for leave" onSubmit={submitLeave} loading={saving} submitLabel="Submit">
        <div className="space-y-3 py-1">
          <TextField select fullWidth size="small" label="Leave type" value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}>
            {LEAVE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <div className="grid grid-cols-2 gap-3">
            <TextField type="date" fullWidth size="small" label="From" InputLabelProps={{ shrink: true }} value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} />
            <TextField type="date" fullWidth size="small" label="To" InputLabelProps={{ shrink: true }} value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} />
          </div>
          <TextField fullWidth size="small" label="Reason" multiline rows={2} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
        </div>
      </FormDialog>
    </div>
  );
}
