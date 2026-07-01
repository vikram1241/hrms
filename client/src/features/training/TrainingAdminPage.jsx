import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Plus, Upload, GraduationCap } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listSections, createSection, listMedia, uploadMedia } from '../../api/training.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

export default function TrainingAdminPage() {
  const dispatch = useDispatch();
  const sections = useAsync(listSections, []);
  const media = useAsync(() => listMedia(), []);
  const [sec, setSec] = useState({ title: '', description: '' });
  const [up, setUp] = useState({ sectionId: '', title: '', description: '', file: null });
  const [busy, setBusy] = useState(false);

  const saveSection = async () => {
    if (!sec.title) return dispatch(notifyError('Enter a section title.'));
    try { await createSection(sec); dispatch(notifySuccess('Section created.')); setSec({ title: '', description: '' }); sections.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const doUpload = async () => {
    if (!up.sectionId || !up.title || !up.file) return dispatch(notifyError('Section, title and video are required.'));
    setBusy(true);
    try { await uploadMedia(up); dispatch(notifySuccess('Video uploaded.')); setUp({ sectionId: '', title: '', description: '', file: null }); media.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };

  const count = (sectionId) => (media.data || []).filter((m) => String(m.sectionId) === String(sectionId)).length;

  return (
    <div>
      <PageHeader title="Training Library" subtitle="Organize training videos into sections" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><GraduationCap size={18} className="text-primary-600" /> Sections</h3>
          <div className="mb-3 flex items-end gap-2">
            <TextField size="small" label="Section title" value={sec.title} onChange={(e) => setSec({ ...sec, title: e.target.value })} />
            <Button size="sm" onClick={saveSection}><Plus size={14} /> Add</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {(sections.data || []).map((s) => (
              <li key={s._id} className="flex justify-between border-t border-line py-2"><span className="font-medium text-ink">{s.title}</span><span className="text-muted">{count(s._id)} video(s)</span></li>
            ))}
            {!sections.data?.length && <li className="py-4 text-center text-muted">No sections yet.</li>}
          </ul>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Upload a training video</h3>
          <div className="space-y-3">
            <TextField select size="small" fullWidth label="Section" value={up.sectionId} onChange={(e) => setUp({ ...up, sectionId: e.target.value })}>
              <MenuItem value="">Select…</MenuItem>
              {(sections.data || []).map((s) => <MenuItem key={s._id} value={s._id}>{s.title}</MenuItem>)}
            </TextField>
            <TextField size="small" fullWidth label="Video title" value={up.title} onChange={(e) => setUp({ ...up, title: e.target.value })} />
            <TextField size="small" fullWidth label="Description" value={up.description} onChange={(e) => setUp({ ...up, description: e.target.value })} />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted hover:border-primary-400">
              <Upload size={16} /> {up.file ? up.file.name : 'Choose a video (MP4/WEBM/MOV)…'}
              <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => setUp({ ...up, file: e.target.files?.[0] || null })} />
            </label>
            <Button onClick={doUpload} loading={busy}>Upload video</Button>
          </div>
        </CardBody></Card>
      </div>
    </div>
  );
}
