import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Plus, Laptop } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listAssets, createAsset, assignAsset, returnAsset } from '../../api/assets.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const TYPES = ['Laptop', 'Mobile', 'Monitor', 'AccessCard', 'Promotional', 'Other'];

export default function AssetsPage() {
  const dispatch = useDispatch();
  const assets = useAsync(() => listAssets(), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ tag: '', type: 'Laptop', description: '', serialNumber: '' });
  const [busy, setBusy] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignUser, setAssignUser] = useState('');

  const save = async (e) => {
    e.preventDefault();
    if (!form.tag) return dispatch(notifyError('Asset tag is required.'));
    setBusy(true);
    try { await createAsset(form); dispatch(notifySuccess('Asset registered.')); setCreateOpen(false); setForm({ tag: '', type: 'Laptop', description: '', serialNumber: '' }); assets.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };
  const doAssign = async (e) => {
    e.preventDefault();
    if (!assignUser) return dispatch(notifyError('Select an employee.'));
    setBusy(true);
    try { await assignAsset(assignTarget._id, assignUser); dispatch(notifySuccess('Asset assigned.')); setAssignTarget(null); setAssignUser(''); assets.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };
  const doReturn = async (a) => {
    try { await returnAsset(a._id); dispatch(notifySuccess('Asset returned.')); assets.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };

  return (
    <div>
      <PageHeader title="Asset Register" subtitle="Laptops, mobiles, promotional materials and more"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Register asset</Button>} />

      <Card><CardBody>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="pb-2">Tag</th><th className="pb-2">Type</th><th className="pb-2">Serial</th><th className="pb-2">Status</th><th className="pb-2 text-right">Action</th></tr></thead>
          <tbody>
            {(assets.data || []).map((a) => (
              <tr key={a._id} className="border-t border-line">
                <td className="py-2 font-medium text-ink">{a.tag}</td>
                <td className="py-2">{a.type}</td>
                <td className="py-2 text-muted">{a.serialNumber || '—'}</td>
                <td className="py-2"><StatusBadge status={a.status === 'Assigned' ? 'processing' : a.status === 'Available' ? 'active' : 'inactive'} label={a.status} /></td>
                <td className="py-2 text-right">
                  {a.status === 'Assigned'
                    ? <Button size="sm" variant="ghost" onClick={() => doReturn(a)}>Mark returned</Button>
                    : <Button size="sm" variant="secondary" onClick={() => setAssignTarget(a)}>Assign</Button>}
                </td>
              </tr>
            ))}
            {!assets.data?.length && <tr><td colSpan={5} className="py-8 text-center text-muted"><Laptop className="mx-auto mb-2 text-slate-300" /> No assets registered yet.</td></tr>}
          </tbody>
        </table>
      </CardBody></Card>

      <FormDialog open={createOpen} onClose={() => setCreateOpen(false)} title="Register asset" onSubmit={save} loading={busy} submitLabel="Register">
        <div className="space-y-3 py-1">
          <TextField size="small" fullWidth label="Asset tag" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
          <TextField select size="small" fullWidth label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField size="small" fullWidth label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <TextField size="small" fullWidth label="Serial number" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
        </div>
      </FormDialog>

      <FormDialog open={Boolean(assignTarget)} onClose={() => setAssignTarget(null)} title={`Assign ${assignTarget?.tag || ''}`} onSubmit={doAssign} loading={busy} submitLabel="Assign">
        <div className="py-1"><EmployeeSelect value={assignUser} onChange={setAssignUser} /></div>
      </FormDialog>
    </div>
  );
}
