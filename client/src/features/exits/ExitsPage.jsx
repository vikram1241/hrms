import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Plus, FileDown, LogOut, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import TablePager from '../../components/ui/TablePager.jsx';
import useAsync from '../../hooks/useAsync.js';
import useClientPager from '../../hooks/useClientPager.js';
import { listExits, initiateExit, updateExit, generateExitLetters, deleteExit } from '../../api/exits.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function ExitsPage() {
  const dispatch = useDispatch();
  const exits = useAsync(() => listExits(), []);
  const pager = useClientPager(exits.data || [], 10);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ userId: '', resignationDate: today(), lastWorkingDay: today(), reason: '' });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    if (!form.userId) return dispatch(notifyError('Select an employee.'));
    setBusy(true);
    try { await initiateExit(form); dispatch(notifySuccess('Exit initiated.')); setCreateOpen(false); setForm({ userId: '', resignationDate: today(), lastWorkingDay: today(), reason: '' }); exits.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };
  const letters = async (r) => {
    try { await generateExitLetters(r._id); dispatch(notifySuccess('Relieving & experience letters generated.')); exits.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateExit(edit._id, {
        status: edit.status,
        exitInterview: { notes: edit.interviewNotes, conductedAt: edit.interviewNotes ? new Date() : null },
        fnfSettlement: { amount: edit.fnfRupees ? Math.round(Number(edit.fnfRupees) * 100) : 0, status: edit.fnfStatus }
      });
      dispatch(notifySuccess('Exit updated.')); setEdit(null); exits.reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };
  const doDelete = async () => {
    if (!deleteTarget?._id) return;
    setDeleting(true);
    try {
      await deleteExit(deleteTarget._id);
      dispatch(notifySuccess('Exit record deleted.'));
      setDeleteTarget(null);
      exits.reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not delete exit.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Exit / Offboarding" subtitle="Resignations, F&F settlement and exit documents"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Initiate exit</Button>} />

      <Card><CardBody>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="pb-2">Resigned</th><th className="pb-2">Last day</th><th className="pb-2">F&amp;F</th><th className="pb-2">Status</th><th className="pb-2 text-right">Actions</th></tr></thead>
          <tbody>
            {pager.pageRows.map((r) => (
              <tr key={r._id} className="border-t border-line">
                <td className="py-2">{fmt(r.resignationDate)}</td>
                <td className="py-2">{fmt(r.lastWorkingDay)}</td>
                <td className="py-2"><StatusBadge status={r.fnfSettlement?.status === 'Settled' ? 'paid' : 'pending'} label={r.fnfSettlement?.status || 'Pending'} /></td>
                <td className="py-2"><StatusBadge status={r.status === 'Completed' ? 'active' : 'processing'} label={r.status} /></td>
                <td className="py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setEdit({ _id: r._id, status: r.status, interviewNotes: r.exitInterview?.notes || '', fnfRupees: r.fnfSettlement?.amount ? r.fnfSettlement.amount / 100 : '', fnfStatus: r.fnfSettlement?.status || 'Pending' })}>Manage</Button>
                    <Button size="sm" onClick={() => letters(r)}><FileDown size={14} /> Letters</Button>
                    {r.status === 'Initiated' && !r.relievingLetterUrl && !r.experienceLetterUrl && (
                      <button type="button" className="btn-ghost p-1 text-danger" onClick={() => setDeleteTarget(r)} aria-label="Delete exit">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!pager.total && <tr><td colSpan={5} className="py-8 text-center text-muted"><LogOut className="mx-auto mb-2 text-slate-300" /> No exits in progress.</td></tr>}
          </tbody>
        </table>
        <TablePager
          page={pager.page} pages={pager.pages} total={pager.total} limit={pager.limit}
          showingCount={pager.pageRows.length}
          onPageChange={pager.setPage}
          onLimitChange={pager.setLimit}
        />
      </CardBody></Card>

      <FormDialog open={createOpen} onClose={() => setCreateOpen(false)} title="Initiate exit" onSubmit={create} loading={busy} submitLabel="Initiate">
        <div className="space-y-3 py-1">
          <EmployeeSelect value={form.userId} onChange={(v) => setForm({ ...form, userId: v })} />
          <div className="grid grid-cols-2 gap-3">
            <TextField type="date" size="small" label="Resignation date" InputLabelProps={{ shrink: true }} value={form.resignationDate} onChange={(e) => setForm({ ...form, resignationDate: e.target.value })} />
            <TextField type="date" size="small" label="Last working day" InputLabelProps={{ shrink: true }} value={form.lastWorkingDay} onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })} />
          </div>
          <TextField size="small" fullWidth label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
      </FormDialog>

      <FormDialog open={Boolean(edit)} onClose={() => setEdit(null)} title="Manage exit" onSubmit={saveEdit} loading={busy} submitLabel="Save">
        {edit && (
          <div className="space-y-3 py-1">
            <TextField select size="small" fullWidth label="Status" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              {['Initiated', 'InProgress', 'Completed'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <TextField size="small" fullWidth multiline rows={2} label="Exit interview notes" value={edit.interviewNotes} onChange={(e) => setEdit({ ...edit, interviewNotes: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField size="small" label="F&F amount (₹)" type="number" value={edit.fnfRupees} onChange={(e) => setEdit({ ...edit, fnfRupees: e.target.value })} />
              <TextField select size="small" label="F&F status" value={edit.fnfStatus} onChange={(e) => setEdit({ ...edit, fnfStatus: e.target.value })}>
                {['Pending', 'Settled'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </div>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete exit record?"
        confirmLabel="Delete"
        message="Only initiated exits without letters can be removed. This cannot be undone."
      />
    </div>
  );
}
