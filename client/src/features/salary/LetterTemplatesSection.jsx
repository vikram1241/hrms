import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import { Plus, Pencil, Trash2, FileText, Eye, Upload } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import useAsync from '../../hooks/useAsync.js';
import {
  listLetterTemplates,
  createLetterTemplate,
  updateLetterTemplate,
  deleteLetterTemplate,
  letterTemplateFileUrl,
  LETTER_TYPES,
  LETTER_TYPE_LABELS
} from '../../api/letterTemplates.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const emptyForm = (type) => ({
  _id: null,
  type,
  name: '',
  title: '',
  body: '',
  isDefault: false,
  active: true,
  file: null,
  existingFileName: null
});

export default function LetterTemplatesSection() {
  const dispatch = useDispatch();
  const fileRef = useRef(null);
  const { data, loading, reload } = useAsync(() => listLetterTemplates(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;

  const templates = data?.data || [];
  const placeholders = data?.meta?.placeholders || [];
  const byType = (t) => templates.filter((x) => x.type === t);

  const openCreate = (type) => setForm(emptyForm(type));
  const openEdit = (t) => setForm({
    _id: t._id,
    type: t.type,
    name: t.name,
    title: t.title || '',
    body: (t.bodyParagraphs || []).join('\n'),
    isDefault: Boolean(t.isDefault),
    active: t.active !== false,
    file: null,
    existingFileName: t.originalFileName || (t.hasFile ? 'Uploaded PDF' : null)
  });

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return dispatch(notifyError('Template name is required.'));

    setBusy(true);
    const fd = new FormData();
    fd.append('type', form.type);
    fd.append('name', form.name.trim());
    fd.append('title', form.title.trim());
    fd.append('isDefault', String(form.isDefault));
    fd.append('active', String(form.active));
    fd.append('bodyParagraphs', JSON.stringify(
      form.body.split('\n').map((s) => s.trim()).filter(Boolean)
    ));
    if (form.file) fd.append('file', form.file);

    try {
      if (form._id) await updateLetterTemplate(form._id, fd);
      else await createLetterTemplate(fd);
      dispatch(notifySuccess('Letter template saved.'));
      setForm(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteLetterTemplate(deleteTarget._id);
      dispatch(notifySuccess('Template deleted.'));
      setDeleteTarget(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Upload a default letterhead PDF per letter type (same pattern as C&amp;F). At generate time, blank fields are filled and the company seal is applied. Mark one template as default per type.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {LETTER_TYPES.map((type) => (
          <Card key={type}>
            <CardBody>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <FileText size={18} className="text-primary-600" /> {LETTER_TYPE_LABELS[type]}
                </h3>
                <Button size="sm" variant="secondary" onClick={() => openCreate(type)}><Plus size={14} /> Add</Button>
              </div>
              <ul className="space-y-2">
                {byType(type).map((t) => (
                  <li key={t._id} className="rounded-lg border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span>{t.originalFileName || (t.hasFile ? 'PDF on file' : (t.title || 'Text template'))}</span>
                          {t.isDefault && <StatusBadge status="active" label="Default" />}
                          <StatusBadge status={t.active ? 'active' : 'inactive'} />
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        {t.hasFile && (
                          <a className="btn-ghost p-1.5 text-primary-600" href={letterTemplateFileUrl(t._id)} target="_blank" rel="noreferrer" title="View template">
                            <Eye size={14} />
                          </a>
                        )}
                        <button type="button" className="btn-ghost p-1.5" onClick={() => openEdit(t)} title="Edit"><Pencil size={14} /></button>
                        <button type="button" className="btn-ghost p-1.5 text-danger" onClick={() => setDeleteTarget(t)} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </li>
                ))}
                {!byType(type).length && (
                  <li className="py-3 text-center text-sm text-muted">No template set up yet.</li>
                )}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>

      <FormDialog
        open={Boolean(form)}
        onClose={() => setForm(null)}
        maxWidth="md"
        title={form?._id ? 'Edit letter template' : `New ${form ? LETTER_TYPE_LABELS[form.type] : ''}`}
        onSubmit={save}
        loading={busy}
        submitLabel="Save template"
      >
        {form && (
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <TextField size="small" label="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <TextField size="small" label="Heading / title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="rounded-lg border border-dashed border-line bg-surface p-4">
              <p className="mb-2 text-sm font-medium text-ink">Letterhead PDF (optional)</p>
              {(form.file || form.existingFileName) && (
                <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
                  <FileText size={13} className="text-primary-600" />
                  {form.file?.name || form.existingFileName}
                  {form.file ? ' (new upload)' : ' (current)'}
                </p>
              )}
              <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> {form.file || form.existingFileName ? 'Replace PDF' : 'Upload PDF'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
              />
              <p className="mt-2 text-xs text-muted">
                Prefer a fillable PDF with AcroForm field names matching placeholders. Max 15 MB.
              </p>
            </div>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={4}
              label="Body fallback (one paragraph per line, used if PDF has no form fields)"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
            <div className="rounded-lg bg-surface p-2 text-xs text-muted">
              <span className="font-medium text-ink">Placeholders:</span> {placeholders.map((p) => `{{${p}}}`).join('  ')}
            </div>
            <FormControlLabel
              control={<Checkbox checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} size="small" />}
              label="Default template for this letter type"
            />
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
        title="Delete letter template?"
        confirmLabel="Delete"
        message={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ''}
      />
    </div>
  );
}
