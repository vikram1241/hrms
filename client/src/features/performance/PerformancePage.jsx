import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Plus, Trash2, Gauge } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listReviews, createReview, createIncentive, listIncentives, createAppraisal, createTrainingRecord } from '../../api/performance.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const rupees = (p) => `INR ${((p || 0) / 100).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function PerformancePage() {
  const dispatch = useDispatch();
  const reviews = useAsync(() => listReviews(), []);
  const incentives = useAsync(() => listIncentives(), []);

  const [revOpen, setRevOpen] = useState(false);
  const [rev, setRev] = useState({ userId: '', period: '', overallRating: 3, comments: '', status: 'Published', kpis: [] });
  const [busy, setBusy] = useState(false);

  const [inc, setInc] = useState({ userId: '', period: '', amountRupees: '', reason: '' });
  const [apr, setApr] = useState({ userId: '', effectiveDate: today(), newDesignation: '', newCTCRupees: '', remarks: '' });
  const [trn, setTrn] = useState({ userId: '', title: '', provider: '', status: 'Assigned' });

  const saveReview = async (e) => {
    e.preventDefault();
    if (!rev.userId || !rev.period) return dispatch(notifyError('Employee and period are required.'));
    setBusy(true);
    try { await createReview(rev); dispatch(notifySuccess('Review saved.')); setRevOpen(false); reviews.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };
  const addKpi = () => setRev((r) => ({ ...r, kpis: [...r.kpis, { title: '', target: '', achieved: '', score: 3 }] }));
  const setKpi = (i, patch) => setRev((r) => ({ ...r, kpis: r.kpis.map((k, idx) => idx === i ? { ...k, ...patch } : k) }));

  const saveInc = async () => {
    if (!inc.userId || !inc.period || !inc.amountRupees) return dispatch(notifyError('Employee, period and amount are required.'));
    try { await createIncentive({ userId: inc.userId, period: inc.period, amount: Math.round(Number(inc.amountRupees) * 100), reason: inc.reason }); dispatch(notifySuccess('Incentive recorded.')); setInc({ userId: '', period: '', amountRupees: '', reason: '' }); incentives.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const saveApr = async () => {
    if (!apr.userId) return dispatch(notifyError('Select an employee.'));
    try { await createAppraisal({ userId: apr.userId, effectiveDate: apr.effectiveDate, newDesignation: apr.newDesignation, newCTC: apr.newCTCRupees ? Math.round(Number(apr.newCTCRupees) * 100) : undefined, remarks: apr.remarks }); dispatch(notifySuccess('Appraisal recorded.')); setApr({ userId: '', effectiveDate: today(), newDesignation: '', newCTCRupees: '', remarks: '' }); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const saveTrn = async () => {
    if (!trn.userId || !trn.title) return dispatch(notifyError('Employee and title are required.'));
    try { await createTrainingRecord(trn); dispatch(notifySuccess('Training record saved.')); setTrn({ userId: '', title: '', provider: '', status: 'Assigned' }); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };

  return (
    <div>
      <PageHeader title="Performance & Training" subtitle="Reviews, incentives, appraisals and training records"
        actions={<Button onClick={() => setRevOpen(true)}><Plus size={16} /> New review</Button>} />

      <Card className="mb-4"><CardBody>
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><Gauge size={18} className="text-primary-600" /> Performance reviews</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="pb-2">Employee</th><th className="pb-2">Period</th><th className="pb-2">Rating</th><th className="pb-2">Status</th></tr></thead>
          <tbody>
            {(reviews.data || []).map((r) => (
              <tr key={r._id} className="border-t border-line"><td className="py-2">{r.userId}</td><td className="py-2">{r.period}</td><td className="py-2">{r.overallRating}/5</td><td className="py-2"><StatusBadge status={r.status === 'Published' ? 'active' : 'pending'} label={r.status} /></td></tr>
            ))}
            {!reviews.data?.length && <tr><td colSpan={4} className="py-6 text-center text-muted">No reviews yet.</td></tr>}
          </tbody>
        </table>
      </CardBody></Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Add incentive</h3>
          <div className="space-y-2">
            <EmployeeSelect value={inc.userId} onChange={(v) => setInc({ ...inc, userId: v })} />
            <TextField size="small" fullWidth label="Period (e.g. Q1-2026)" value={inc.period} onChange={(e) => setInc({ ...inc, period: e.target.value })} />
            <TextField size="small" fullWidth label="Amount (₹)" type="number" value={inc.amountRupees} onChange={(e) => setInc({ ...inc, amountRupees: e.target.value })} />
            <Button size="sm" onClick={saveInc}>Save incentive</Button>
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Record appraisal</h3>
          <div className="space-y-2">
            <EmployeeSelect value={apr.userId} onChange={(v) => setApr({ ...apr, userId: v })} />
            <TextField size="small" fullWidth type="date" label="Effective date" InputLabelProps={{ shrink: true }} value={apr.effectiveDate} onChange={(e) => setApr({ ...apr, effectiveDate: e.target.value })} />
            <TextField size="small" fullWidth label="New designation" value={apr.newDesignation} onChange={(e) => setApr({ ...apr, newDesignation: e.target.value })} />
            <TextField size="small" fullWidth label="New CTC (₹)" type="number" value={apr.newCTCRupees} onChange={(e) => setApr({ ...apr, newCTCRupees: e.target.value })} />
            <Button size="sm" onClick={saveApr}>Save appraisal</Button>
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Add training record</h3>
          <div className="space-y-2">
            <EmployeeSelect value={trn.userId} onChange={(v) => setTrn({ ...trn, userId: v })} />
            <TextField size="small" fullWidth label="Title" value={trn.title} onChange={(e) => setTrn({ ...trn, title: e.target.value })} />
            <TextField size="small" fullWidth label="Provider" value={trn.provider} onChange={(e) => setTrn({ ...trn, provider: e.target.value })} />
            <TextField select size="small" fullWidth label="Status" value={trn.status} onChange={(e) => setTrn({ ...trn, status: e.target.value })}>
              {['Assigned', 'In-Progress', 'Completed'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <Button size="sm" onClick={saveTrn}>Save record</Button>
          </div>
        </CardBody></Card>
      </div>

      <FormDialog open={revOpen} onClose={() => setRevOpen(false)} title="New performance review" onSubmit={saveReview} loading={busy} submitLabel="Save review" maxWidth="md">
        <div className="space-y-3 py-1">
          <EmployeeSelect value={rev.userId} onChange={(v) => setRev({ ...rev, userId: v })} />
          <div className="grid grid-cols-2 gap-3">
            <TextField size="small" label="Period (e.g. Q1-2026)" value={rev.period} onChange={(e) => setRev({ ...rev, period: e.target.value })} />
            <TextField size="small" type="number" label="Overall rating (0-5)" value={rev.overallRating} onChange={(e) => setRev({ ...rev, overallRating: Number(e.target.value) })} inputProps={{ min: 0, max: 5 }} />
          </div>
          <TextField size="small" fullWidth multiline rows={2} label="Comments" value={rev.comments} onChange={(e) => setRev({ ...rev, comments: e.target.value })} />
          <TextField select size="small" fullWidth label="Status" value={rev.status} onChange={(e) => setRev({ ...rev, status: e.target.value })}>
            <MenuItem value="Draft">Draft</MenuItem><MenuItem value="Published">Published (visible to employee)</MenuItem>
          </TextField>
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-ink">KPIs</span><Button size="sm" variant="secondary" onClick={addKpi}><Plus size={13} /> Add KPI</Button></div>
          {rev.kpis.map((k, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <TextField size="small" label="Title" value={k.title} onChange={(e) => setKpi(i, { title: e.target.value })} sx={{ gridColumn: 'span 4' }} />
              <TextField size="small" label="Target" value={k.target} onChange={(e) => setKpi(i, { target: e.target.value })} sx={{ gridColumn: 'span 3' }} />
              <TextField size="small" label="Achieved" value={k.achieved} onChange={(e) => setKpi(i, { achieved: e.target.value })} sx={{ gridColumn: 'span 3' }} />
              <TextField size="small" type="number" label="Score" value={k.score} onChange={(e) => setKpi(i, { score: Number(e.target.value) })} sx={{ gridColumn: 'span 2' }} />
            </div>
          ))}
        </div>
      </FormDialog>
    </div>
  );
}
