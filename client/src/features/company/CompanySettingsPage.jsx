import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import { Building2, Upload, Stamp, PenTool, Mail, Eye, X, UserRound, FileText, Image } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import useAsync from '../../hooks/useAsync.js';
import { getCompany, updateCompany, uploadCompanyAsset, companyAssetUrl } from '../../api/company.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const emptyMail = {
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpUser: '',
  mailFrom: '',
  smtpPass: '',
  smtpPassSet: false
};

const emptyHr = { name: '', designation: '', contact: '', email: '' };

const isPdfUrl = (url) => /\.pdf$/i.test(url || '');

export default function CompanySettingsPage() {
  const dispatch = useDispatch();
  const { data: company, loading, reload } = useAsync(getCompany, []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null); // { kind, label, isPdf }

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '',
        contactEmail: company.contactEmail || '',
        branding: { ...company.branding },
        hr: { ...emptyHr, ...(company.hr || {}) },
        statutory: { ...company.statutory },
        address: { ...company.address },
        mail: {
          ...emptyMail,
          ...(company.mail || {}),
          smtpPass: ''
        }
      });
    }
  }, [company]);

  if (loading || !form) return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;

  const set = (path, value) => setForm((f) => {
    const next = structuredClone(f);
    const keys = path.split('.');
    let o = next;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys.at(-1)] = value;
    return next;
  });

  const save = async () => {
    setSaving(true);
    try {
      const payload = structuredClone(form);
      if (!payload.mail?.smtpPass?.trim()) {
        if (payload.mail) delete payload.mail.smtpPass;
      }
      delete payload.mail?.smtpPassSet;
      await updateCompany(payload);
      dispatch(notifySuccess('Company configuration saved.'));
      reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setSaving(false); }
  };

  const upload = async (kind, file) => {
    if (!file) return;
    try {
      await uploadCompanyAsset(kind, file);
      dispatch(notifySuccess(`${kind} uploaded.`));
      reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
  };

  const field = (label, path, rest = {}) => (
    <TextField size="small" fullWidth label={label} value={path.split('.').reduce((o, k) => o?.[k], form) ?? ''}
      onChange={(e) => set(path, e.target.value)} {...rest} />
  );

  const openPreview = (kind, label, url) => {
    if (!url) return;
    if (isPdfUrl(url)) {
      window.open(`${companyAssetUrl(kind)}?t=${Date.now()}`, '_blank', 'noopener,noreferrer');
      return;
    }
    setPreview({ kind, label, isPdf: false });
  };

  const assetUpload = (kind, label, url, Icon, { accept = 'image/png,image/jpeg', hint } = {}) => {
    const pdf = isPdfUrl(url);
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line p-3">
        <button
          type="button"
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-surface disabled:cursor-default"
          disabled={!url}
          onClick={() => openPreview(kind, label, url)}
          title={url ? 'View' : undefined}
        >
          {url && !pdf
            ? <img src={`${companyAssetUrl(kind)}?t=${encodeURIComponent(url)}`} alt={label} className="h-full w-full object-contain" />
            : <Icon size={22} className={url ? 'text-primary-600' : 'text-slate-400'} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          {url && (
            <p className="truncate text-xs text-muted">
              {form.branding[`${kind}FileName`] || (pdf ? 'PDF on file' : 'Image on file')}
            </p>
          )}
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary-600 hover:underline">
              <Upload size={13} /> {url ? 'Replace' : 'Upload'}
              <input type="file" accept={accept} hidden onChange={(e) => upload(kind, e.target.files?.[0])} />
            </label>
            {url && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                onClick={() => openPreview(kind, label, url)}
              >
                <Eye size={13} /> View
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Company Settings" subtitle="Branding, HR contacts, letter templates, mail and seal assets"
        actions={<Button onClick={save} loading={saving}>Save changes</Button>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><Building2 size={18} className="text-primary-600" /> Company profile</h3>
          <div className="space-y-3">
            {field('Company name', 'name')}
            {field('Contact email', 'contactEmail')}
            <div className="grid grid-cols-2 gap-3">
              {field('City', 'address.city')}
              {field('State', 'address.state')}
            </div>
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Statutory registration</h3>
          <div className="grid grid-cols-2 gap-3">
            {field('GSTIN', 'statutory.gstin')}
            {field('CIN', 'statutory.cin')}
          </div>
        </CardBody></Card>

        <Card className="lg:col-span-2"><CardBody>
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
            <Mail size={18} className="text-primary-600" /> Outbound email (SMTP)
          </h3>
          <p className="mb-3 text-xs text-muted">
            Used for offer letters, credentials and payslip notices. Saved on this company and read from the database on every send.
            {form.mail.smtpPassSet
              ? ' A password is already stored — leave the password field blank to keep it.'
              : ' No password stored yet — enter SMTP credentials to enable delivery.'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {field('SMTP host', 'mail.smtpHost', { placeholder: 'smtp.gmail.com' })}
            {field('SMTP port', 'mail.smtpPort', { type: 'number' })}
            {field('SMTP username', 'mail.smtpUser', { autoComplete: 'off' })}
            {field('SMTP password', 'mail.smtpPass', {
              type: 'password',
              autoComplete: 'new-password',
              placeholder: form.mail.smtpPassSet ? '•••••••• (unchanged)' : 'App password / SMTP secret'
            })}
            <div className="sm:col-span-2 lg:col-span-3">
              {field('From address', 'mail.mailFrom', {
                placeholder: 'e.g. Mirus Med Sciences <hr@mirus.com>'
              })}
            </div>
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Authorized signatory</h3>
          <p className="mb-3 text-xs text-muted">Director / authorized person whose signature and stamp seal issued PDFs.</p>
          <div className="space-y-3">
            {field('Signatory name', 'branding.authorizedSignatoryName')}
            {field('Signatory designation', 'branding.authorizedSignatoryDesignation')}
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            <UserRound size={18} className="text-primary-600" /> HR details
          </h3>
          <p className="mb-3 text-xs text-muted">Printed on offer and appointment letters as the HR contact block.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field('HR name', 'hr.name')}
            {field('Designation', 'hr.designation', { placeholder: 'e.g. HR Manager' })}
            {field('Contact', 'hr.contact', { placeholder: 'Phone number' })}
            {field('Email', 'hr.email', { type: 'email' })}
          </div>
        </CardBody></Card>

        <Card className="lg:col-span-2"><CardBody>
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
            <FileText size={18} className="text-primary-600" /> Company letter assets
          </h3>
          <p className="mb-3 text-xs text-muted">
            Letter header and page template apply to every generated PDF (offers, appointments, exits, payslips, C&amp;F, sealed docs).
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {assetUpload('letterhead', 'Company letter header', form.branding.letterheadUrl, Image, {
              accept: 'image/png,image/jpeg,application/pdf,.pdf',
              hint: 'Header banner used when no full page template is uploaded.'
            })}
            {assetUpload('letterOutline', 'Company letter template / outline', form.branding.letterOutlineUrl, FileText, {
              accept: 'application/pdf,.pdf,image/png,image/jpeg',
              hint: 'Blank letterhead page (PDF/image) used as the full-page background for all generated documents.'
            })}
          </div>
        </CardBody></Card>

        <Card className="lg:col-span-2"><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Seal &amp; branding assets</h3>
          <p className="mb-3 text-xs text-muted">
            Logo, stamp and signature are printed onto issued PDFs. Prefer &quot;Company Logo with stamp&quot;
            when you have a combined seal image. Click View to confirm uploads.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {assetUpload('logo', 'Company logo', form.branding.logoUrl, Building2)}
            {assetUpload('stamp', 'Company stamp', form.branding.stampUrl, Stamp)}
            {assetUpload('logoWithStamp', 'Company Logo with stamp', form.branding.logoWithStampUrl, Stamp, {
              hint: 'Combined logo + stamp image used on letter seals when available.'
            })}
            {assetUpload('signature', 'Authorized signature', form.branding.signatureUrl, PenTool)}
          </div>
        </CardBody></Card>
      </div>

      <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} maxWidth="sm" fullWidth>
        <DialogTitle className="flex items-center justify-between gap-2 pr-3">
          <span>{preview?.label || 'Preview'}</span>
          <IconButton size="small" onClick={() => setPreview(null)} aria-label="Close">
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {preview && (
            <div className="flex min-h-[240px] items-center justify-center rounded-lg bg-surface p-4">
              <img
                src={`${companyAssetUrl(preview.kind)}?t=${Date.now()}`}
                alt={preview.label}
                className="max-h-[70vh] max-w-full object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
