import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import { Building2, Upload, Stamp, PenTool, Mail } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import useAsync from '../../hooks/useAsync.js';
import { getCompany, updateCompany, uploadCompanyAsset } from '../../api/company.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const asset = (url) => (url ? `/${url}` : null);

const emptyMail = {
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpUser: '',
  mailFrom: '',
  smtpPass: '',
  smtpPassSet: false
};

export default function CompanySettingsPage() {
  const dispatch = useDispatch();
  const { data: company, loading, reload } = useAsync(getCompany, []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '',
        contactEmail: company.contactEmail || '',
        branding: { ...company.branding },
        statutory: { ...company.statutory },
        address: { ...company.address },
        mail: {
          ...emptyMail,
          ...(company.mail || {}),
          smtpPass: '' // never prefill secret; leave blank to keep existing
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
      // Omit blank password so the server keeps the stored secret.
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

  // Plain render helpers (NOT components) so inputs keep focus across renders.
  const field = (label, path, rest = {}) => (
    <TextField size="small" fullWidth label={label} value={path.split('.').reduce((o, k) => o?.[k], form) ?? ''}
      onChange={(e) => set(path, e.target.value)} {...rest} />
  );

  const assetUpload = (kind, label, url, Icon) => (
    <div className="flex items-center gap-3 rounded-lg border border-line p-3">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded bg-surface">
        {url ? <img src={asset(url)} alt={label} className="h-full w-full object-contain" /> : <Icon size={22} className="text-slate-400" />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary-600 hover:underline">
          <Upload size={13} /> {url ? 'Replace' : 'Upload'} image
          <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => upload(kind, e.target.files?.[0])} />
        </label>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Company Settings" subtitle="Branding, mail (SMTP), statutory numbers and PDF seal assets"
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
            {field('PF Number', 'statutory.pfNumber')}
            {field('ESI Number', 'statutory.esiNumber')}
            {field('PT Number', 'statutory.ptNumber')}
            {field('TAN', 'statutory.tan')}
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
          <div className="space-y-3">
            {field('Signatory name', 'branding.authorizedSignatoryName')}
            {field('Signatory designation', 'branding.authorizedSignatoryDesignation')}
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Seal &amp; branding assets</h3>
          <p className="mb-3 text-xs text-muted">Stamp &amp; signature are printed onto appointment letters, NDAs and other issued PDFs.</p>
          <div className="space-y-3">
            {assetUpload('logo', 'Company logo', form.branding.logoUrl, Building2)}
            {assetUpload('stamp', 'Company stamp', form.branding.stampUrl, Stamp)}
            {assetUpload('signature', 'Authorized signature', form.branding.signatureUrl, PenTool)}
          </div>
        </CardBody></Card>
      </div>
    </div>
  );
}
