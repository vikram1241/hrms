import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import { Plus, Pencil, Trash2, FileText } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listLetterTemplates, createLetterTemplate, updateLetterTemplate, deleteLetterTemplate, LETTER_TYPE_LABELS } from '../../api/letterTemplates.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const TYPES = ['OfferLetter', 'AppointmentLetter', 'ServiceLetter', 'FNFLetter'];
const emptyForm = (type) => ({ _id: null, type, name: '', title: '', body: '' });

export default function LetterTemplatesSection() {
  const dispatch = useDispatch();
  const { data, loading, reload } = useAsync(() => listLetterTemplates(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;

  const templates = data?.data || [];
  const placeholders = data?.meta?.placeholders || [];
  const byType = (t) => templates.filter((x) => x.type === t);

  const openCreate = (type) => setForm(emptyForm(type));
  const openEdit = (t) => setForm({ _id: t._id, type: t.type, name: t.name, title: t.title || '', body: (t.bodyParagraphs || []).join('\n') });

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return dispatch(notifyError('Template name is required.'));
    setBusy(true);
    const payload = { type: form.type, name: form.name, title: form.title, bodyParagraphs: form.body.split('\n').map((s) => s.trim()).filter(Boolean) };
    try {
      if (form._id) await updateLetterTemplate(form._id, payload);
      else await createLetterTemplate(payload);
      dispatch(notifySuccess('Letter template saved.'));
      setForm(null);
      reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { await deleteLetterTemplate(deleteTarget._id); dispatch(notifySuccess('Template deleted.')); setDeleteTarget(null); reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {TYPES.map((type) => (
        <Card key={type}><CardBody>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink"><FileText size={18} className="text-primary-600" /> {LETTER_TYPE_LABELS[type]}</h3>
            <Button size="sm" variant="secondary" onClick={() => openCreate(type)}><Plus size={14} /> Add</Button>
          </div>
          <ul className="space-y-2">
            {byType(type).map((t) => (
              <li key={t._id} className="flex items-start justify-between rounded-lg border border-line p-3">
                <div>
                  <p className="text-sm font-medium text-ink">{t.name}</p>
                  <p className="text-xs text-muted">{t.title || '—'} · {(t.bodyParagraphs || []).length} paragraph(s)</p>
                </div>
                <div className="flex gap-1">
                  <button className="btn-ghost p-1.5" onClick={() => openEdit(t)}><Pencil size={14} /></button>
                  <button className="btn-ghost p-1.5 text-danger" onClick={() => setDeleteTarget(t)}><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
            {!byType(type).length && <li className="py-3 text-center text-sm text-muted">No template set up yet.</li>}
          </ul>
        </CardBody></Card>
      ))}

      <FormDialog open={Boolean(form)} onClose={() => setForm(null)} maxWidth="md"
        title={form?._id ? 'Edit letter template' : `New ${form ? LETTER_TYPE_LABELS[form.type] : ''}`}
        onSubmit={save} loading={busy} submitLabel="Save template">
        {form && (
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <TextField size="small" label="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <TextField size="small" label="Heading / title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <TextField size="small" fullWidth multiline minRows={6} label="Body (one paragraph per line)"
              value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <div className="rounded-lg bg-surface p-2 text-xs text-muted">
              <span className="font-medium text-ink">Placeholders:</span> {placeholders.map((p) => `{{${p}}}`).join('  ')}
            </div>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={remove} loading={busy}
        title="Delete letter template?" confirmLabel="Delete"
        message={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ''} />
    </div>
  );
}
