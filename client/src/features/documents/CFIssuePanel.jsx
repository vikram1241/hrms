import { UuseEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Truck, Send, Eye, Download, FileDown } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listCFTemplates, downloadCFTemplateFileBlob, CF_TYPE_LABELS } from '../../api/cfTemplates.js';
import {
  getCFIssueFields,
  listCFIssues,
  createAndSendCFIssue,
  cfIssuePdfUrl,
  downloadCFIssuePdfBlob
} from '../../api/cfIssues.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const triggerBlobDownload = (data, filename) => {
  const blob = new Blob([data], { type: 'application/pdf' });
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
};

/**
 * Documents Center panel: pick a C&F template, then fill blanks in a modal
 * and generate + email or download the agreement PDF, or download the blank template.
 */
export default function CFIssuePanel() {
  const dispatch = useDispatch();
  const templates = useAsync(() => listCFTemplates({ active: 'true' }), []);
  const issues = useAsync(() => listCFIssues(), []);

  const [templateId, setTemplateId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('mail'); // 'mail' | 'download'
  const [fieldDefs, setFieldDefs] = useState([]);
  const [values, setValues] = useState({});
  const [loadingFields, setLoadingFields] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const selected = useMemo(
    () => (templates.data?.data || []).find((t) => t._id === templateId) || null,
    [templates.data, templateId]
  );

  // Auto-select first active template when list loads if none currently selected
  useEffect(() => {
    const list = templates.data?.data || [];
    if (list.length > 0 && (!templateId || !list.some((t) => t._id === templateId))) {
      setTemplateId(list[0]._id);
    }
  }, [templates.data, templateId]);

  // Re-fetch templates and issues whenever user switches back to this window/tab
  useEffect(() => {
    const handleFocus = () => {
      templates.reload();
      issues.reload();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [templates, issues]);

  const openFillDialog = async (mode = 'mail') => {
    let currentId = templateId;
    let freshTemplates = templates.data?.data || [];
    try {
      const refreshed = await templates.reload();
      if (refreshed?.data) freshTemplates = refreshed.data;
    } catch { /* use existing */ }

    if (!currentId && freshTemplates.length > 0) {
      currentId = freshTemplates[0]._id;
      setTemplateId(currentId);
    }

    const currentSelected = freshTemplates.find((t) => t._id === currentId) || null;
    if (!currentId || !currentSelected) return dispatch(notifyError('Select a C&F template first.'));

    setDialogMode(mode);
    setLoadingFields(true);
    setDialogOpen(true);
    try {
      const res = await getCFIssueFields(currentSelected.type);
      setFieldDefs(res.fields || []);
      const next = {};
      for (const f of res.fields || []) next[f.key] = '';
      setValues(next);
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not load template fields'));
      setDialogOpen(false);
    } finally {
      setLoadingFields(false);
    }
  };

  const closeDialog = (force = false) => {
    if (busy && !force) return;
    setDialogOpen(false);
    setFieldDefs([]);
    setValues({});
  };

  const setVal = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  const handleDownloadUploadedPdf = async () => {
    let currentId = templateId;
    let freshTemplates = templates.data?.data || [];
    try {
      const refreshed = await templates.reload();
      if (refreshed?.data) freshTemplates = refreshed.data;
    } catch { /* use existing */ }

    if (!currentId && freshTemplates.length > 0) {
      currentId = freshTemplates[0]._id;
      setTemplateId(currentId);
    }

    const currentSelected = freshTemplates.find((t) => t._id === currentId) || null;
    if (!currentId || !currentSelected) return dispatch(notifyError('Select a C&F template first.'));
    if (!currentSelected.hasFile) return dispatch(notifyError('No uploaded PDF file for this template.'));

    setDownloadingTemplate(true);
    try {
      const res = await downloadCFTemplateFileBlob(currentSelected._id);
      const filename = currentSelected.originalFileName || `${(currentSelected.name || 'cf-template').replace(/[^\w.-]+/g, '_')}.pdf`;
      triggerBlobDownload(res.data, filename);
      dispatch(notifySuccess(`Downloaded ${filename}`));
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Failed to download template PDF'));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleSubmitDialog = async (e) => {
    e.preventDefault();
    if (!templateId) return dispatch(notifyError('Select a C&F template.'));

    if (dialogMode === 'mail' && !String(values.recipientEmail || '').trim()) {
      return dispatch(notifyError('Recipient email is required to send agreement.'));
    }

    setBusy(true);
    try {
      const res = await createAndSendCFIssue({
        templateId,
        fields: values,
        recipientEmail: values.recipientEmail?.trim(),
        action: dialogMode,
        sendEmail: dialogMode === 'mail'
      });

      if (dialogMode === 'download' && res.issue?._id) {
        const downloadRes = await downloadCFIssuePdfBlob(res.issue._id);
        const filename = `${(res.issue.partyName || res.issue.templateName || 'cf-agreement').replace(/[^\w.-]+/g, '_')}.pdf`;
        triggerBlobDownload(downloadRes.data, filename);
        dispatch(notifySuccess('C&F agreement generated and downloaded.'));
      } else {
        dispatch(notifySuccess(res.message || 'C&F agreement processed.'));
      }

      setBusy(false);
      closeDialog(true);
      issues.reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Operation failed'));
      setBusy(false);
    }
  };

  const emailFields = fieldDefs.filter((f) => f.key === 'recipientEmail' || f.type === 'email');
  const otherFields = fieldDefs.filter((f) => f.key !== 'recipientEmail' && f.type !== 'email');
  const shortFields = otherFields.filter((f) => f.type !== 'textarea');
  const longFields = otherFields.filter((f) => f.type === 'textarea');

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardBody>
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
            <Truck size={18} className="text-primary-600" /> Generate &amp; send C&amp;F agreement
          </h3>
          <p className="mb-4 text-sm text-muted">
            Select a template, fill party details (name, address, territory, email), then generate and email or download. Date, place and margin default automatically when left blank.
          </p>

          <div className="space-y-3">
            <TextField
              select
              size="small"
              fullWidth
              label="C&F template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              onFocus={() => templates.reload()}
            >
              <MenuItem value="">Select template…</MenuItem>
              {(templates.data?.data || []).map((t) => (
                <MenuItem key={t._id} value={t._id}>
                  {CF_TYPE_LABELS[t.type] || t.type} — {t.name}
                </MenuItem>
              ))}
            </TextField>

            {selected && (
              <div className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
                <p className="font-medium text-ink">{selected.name}</p>
                <p className="text-xs text-muted">
                  {CF_TYPE_LABELS[selected.type]} agreement template
                  {selected.hasFile && (
                    <span> · {selected.originalFileName || 'PDF file attached'}</span>
                  )}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                onClick={() => openFillDialog('mail')}
                disabled={!templateId || loadingFields || busy || downloadingTemplate}
                className="w-full sm:w-auto"
              >
                <Send size={16} /> Fill blanks and mail
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => openFillDialog('download')}
                disabled={!templateId || loadingFields || busy || downloadingTemplate}
                className="w-full sm:w-auto"
              >
                <FileDown size={16} /> Fill blanks and download
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={handleDownloadUploadedPdf}
                disabled={!templateId || !selected?.hasFile || downloadingTemplate || busy}
                loading={downloadingTemplate}
                className="w-full sm:w-auto"
                title={!selected?.hasFile ? 'No file uploaded for this template' : 'Download uploaded agreement PDF'}
              >
                <Download size={16} /> Download
              </Button>
            </div>

            {!templates.data?.data?.length && !templates.loading && (
              <p className="text-sm text-muted">No C&amp;F templates yet. Add them under Setup Templates → C&amp;F Templates.</p>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Recently generated C&amp;F agreements</h3>
          {issues.loading ? (
            <div className="flex justify-center py-10"><Spinner className="text-primary-600" /></div>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {(issues.data?.data || []).map((i) => (
                <li key={i._id} className="flex items-start justify-between gap-2 rounded-lg border border-line p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{i.partyName || i.templateName}</p>
                    <p className="text-xs text-muted">{i.typeLabel} · {i.recipientEmail}</p>
                    <div className="mt-1">
                      <StatusBadge
                        status={i.status === 'sent' ? 'sent' : i.status === 'failed' ? 'rejected' : 'pending'}
                        label={i.status}
                      />
                    </div>
                  </div>
                  <a className="btn-ghost p-1.5 text-primary-600" href={cfIssuePdfUrl(i._id)} target="_blank" rel="noreferrer" title="View PDF">
                    <Eye size={16} />
                  </a>
                </li>
              ))}
              {!issues.data?.data?.length && (
                <li className="py-8 text-center text-sm text-muted">No C&amp;F agreements generated yet.</li>
              )}
            </ul>
          )}
        </CardBody>
      </Card>

      <FormDialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="md"
        title={dialogMode === 'download' ? 'Fill blanks & download C&F agreement' : 'Fill blanks & mail C&F agreement'}
        subtitle={selected ? `${CF_TYPE_LABELS[selected.type] || selected.type} · ${selected.name}` : ''}
        onSubmit={handleSubmitDialog}
        loading={busy}
        submitLabel={
          dialogMode === 'download' ? (
            <>
              <Download size={16} /> Generate &amp; download PDF
            </>
          ) : (
            <>
              <Send size={16} /> Generate &amp; email PDF
            </>
          )
        }
        formId="cf-issue-form"
      >
        {loadingFields ? (
          <div className="flex justify-center py-16"><Spinner size={32} className="text-primary-600" /></div>
        ) : (
          <div className="space-y-5 py-1">
            {emailFields.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {dialogMode === 'download' ? 'Delivery (optional for download)' : 'Delivery'}
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {emailFields.map((f) => (
                    <TextField
                      key={f.key}
                      size="small"
                      fullWidth
                      autoFocus
                      required={dialogMode === 'mail' && f.required}
                      type="email"
                      label={dialogMode === 'download' ? `${f.label} (optional)` : f.label}
                      value={values[f.key] || ''}
                      onChange={(e) => setVal(f.key, e.target.value)}
                    />
                  ))}
                </div>
              </section>
            )}

            {shortFields.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Agreement details</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {shortFields.map((f) => (
                    <TextField
                      key={f.key}
                      size="small"
                      fullWidth
                      required={f.required}
                      label={f.label}
                      value={values[f.key] || ''}
                      onChange={(e) => setVal(f.key, e.target.value)}
                    />
                  ))}
                </div>
              </section>
            )}

            {longFields.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Address &amp; notes</p>
                <div className="grid grid-cols-1 gap-3">
                  {longFields.map((f) => (
                    <TextField
                      key={f.key}
                      size="small"
                      fullWidth
                      required={f.required}
                      multiline
                      minRows={2}
                      label={f.label}
                      value={values[f.key] || ''}
                      onChange={(e) => setVal(f.key, e.target.value)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </FormDialog>
    </div>
  );
}
