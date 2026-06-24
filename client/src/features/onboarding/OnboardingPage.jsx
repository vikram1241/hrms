import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import { Plus, Trash2, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { getOnboardingStatus, savePersonal, saveFamily, saveContact, saveBank } from '../../api/onboarding.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const STEPS = ['Personal', 'Family', 'Contact', 'Bank'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const RELATIONS = ['Father', 'Mother', 'Spouse', 'Sibling', 'Child', 'Other'];
const stageToStep = { personal: 0, family: 1, contact: 2, bank: 3, completed: 3 };

export default function OnboardingPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);

  const [personal, setPersonal] = useState({ firstName: '', lastName: '', dateOfBirth: '', gender: '', bloodGroup: '', maritalStatus: 'Single' });
  const [family, setFamily] = useState([{ name: '', relationship: 'Father', dependent: false, contactNumber: '' }]);
  const [contact, setContact] = useState({ personalMobile: '', emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '', presentAddress: { street: '', city: '', state: '', zipCode: '', country: 'India' }, sameAsPresent: true, permanentAddress: { street: '', city: '', state: '', zipCode: '', country: 'India' } });
  const [bank, setBank] = useState({ accountHolderName: '', accountNumber: '', bankName: '', ifscCode: '', panNumber: '', uanNumber: '' });

  useEffect(() => { getOnboardingStatus().then((s) => setActive(stageToStep[s.stage] ?? 0)).catch(() => {}); }, []);

  const next = () => setActive((a) => Math.min(a + 1, STEPS.length - 1));
  const back = () => setActive((a) => Math.max(a - 1, 0));

  const run = async (fn, after) => {
    setSaving(true);
    try { await fn(); dispatch(notifySuccess('Saved.')); after?.(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setSaving(false); }
  };

  const addr = (which) => (k) => (e) => setContact({ ...contact, [which]: { ...contact[which], [k]: e.target.value } });

  return (
    <div>
      <PageHeader title="Onboarding Wizard" subtitle="Complete your employee profile" />

      <Card>
        <CardBody>
          <Stepper activeStep={active} alternativeLabel sx={{ mb: 4 }}>
            {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
          </Stepper>

          {/* Step 1: Personal */}
          {active === 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="First Name" value={personal.firstName} onChange={(e) => setPersonal({ ...personal, firstName: e.target.value })} fullWidth />
              <TextField label="Last Name" value={personal.lastName} onChange={(e) => setPersonal({ ...personal, lastName: e.target.value })} fullWidth />
              <TextField label="Date of Birth" type="date" value={personal.dateOfBirth} onChange={(e) => setPersonal({ ...personal, dateOfBirth: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="Gender" select value={personal.gender} onChange={(e) => setPersonal({ ...personal, gender: e.target.value })} fullWidth>
                {GENDERS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </TextField>
              <TextField label="Blood Group" value={personal.bloodGroup} onChange={(e) => setPersonal({ ...personal, bloodGroup: e.target.value })} fullWidth />
              <TextField label="Marital Status" select value={personal.maritalStatus} onChange={(e) => setPersonal({ ...personal, maritalStatus: e.target.value })} fullWidth>
                {['Single', 'Married', 'Divorced', 'Widowed'].map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            </div>
          )}

          {/* Step 2: Family */}
          {active === 1 && (
            <div className="space-y-3">
              {family.map((m, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <TextField className="col-span-4" size="small" label="Name" value={m.name} onChange={(e) => setFamily(family.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
                  <TextField className="col-span-3" size="small" select label="Relationship" value={m.relationship} onChange={(e) => setFamily(family.map((x, idx) => idx === i ? { ...x, relationship: e.target.value } : x))}>
                    {RELATIONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </TextField>
                  <TextField className="col-span-3" size="small" label="Contact" value={m.contactNumber} onChange={(e) => setFamily(family.map((x, idx) => idx === i ? { ...x, contactNumber: e.target.value } : x))} />
                  <FormControlLabel className="col-span-1" control={<Checkbox size="small" checked={m.dependent} onChange={(e) => setFamily(family.map((x, idx) => idx === i ? { ...x, dependent: e.target.checked } : x))} />} label="Dep." />
                  <IconButton className="col-span-1" size="small" color="error" onClick={() => setFamily(family.filter((_, idx) => idx !== i))}><Trash2 size={16} /></IconButton>
                </div>
              ))}
              <button type="button" className="btn-secondary btn-sm" onClick={() => setFamily([...family, { name: '', relationship: 'Other', dependent: false, contactNumber: '' }])}><Plus size={14} /> Add Member</button>
            </div>
          )}

          {/* Step 3: Contact */}
          {active === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Personal Mobile" value={contact.personalMobile} onChange={(e) => setContact({ ...contact, personalMobile: e.target.value })} fullWidth />
                <TextField label="Emergency Contact Name" value={contact.emergencyContactName} onChange={(e) => setContact({ ...contact, emergencyContactName: e.target.value })} fullWidth />
                <TextField label="Emergency Relation" value={contact.emergencyContactRelation} onChange={(e) => setContact({ ...contact, emergencyContactRelation: e.target.value })} fullWidth />
                <TextField label="Emergency Phone" value={contact.emergencyContactPhone} onChange={(e) => setContact({ ...contact, emergencyContactPhone: e.target.value })} fullWidth />
              </div>
              <p className="text-sm font-semibold text-ink">Present Address</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Street" value={contact.presentAddress.street} onChange={addr('presentAddress')('street')} fullWidth />
                <TextField label="City" value={contact.presentAddress.city} onChange={addr('presentAddress')('city')} fullWidth />
                <TextField label="State" value={contact.presentAddress.state} onChange={addr('presentAddress')('state')} fullWidth />
                <TextField label="Zip Code" value={contact.presentAddress.zipCode} onChange={addr('presentAddress')('zipCode')} fullWidth />
              </div>
              <FormControlLabel control={<Checkbox checked={contact.sameAsPresent} onChange={(e) => setContact({ ...contact, sameAsPresent: e.target.checked })} />} label="Permanent address same as present" />
              {!contact.sameAsPresent && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField label="Permanent Street" value={contact.permanentAddress.street} onChange={addr('permanentAddress')('street')} fullWidth />
                  <TextField label="Permanent City" value={contact.permanentAddress.city} onChange={addr('permanentAddress')('city')} fullWidth />
                  <TextField label="Permanent State" value={contact.permanentAddress.state} onChange={addr('permanentAddress')('state')} fullWidth />
                  <TextField label="Permanent Zip" value={contact.permanentAddress.zipCode} onChange={addr('permanentAddress')('zipCode')} fullWidth />
                </div>
              )}
            </div>
          )}

          {/* Step 4: Bank */}
          {active === 3 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Account Holder Name" value={bank.accountHolderName} onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })} fullWidth />
              <TextField label="Account Number" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} fullWidth />
              <TextField label="Bank Name" value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} fullWidth />
              <TextField label="IFSC Code" value={bank.ifscCode} onChange={(e) => setBank({ ...bank, ifscCode: e.target.value })} fullWidth />
              <TextField label="PAN Number" value={bank.panNumber} onChange={(e) => setBank({ ...bank, panNumber: e.target.value })} fullWidth />
              <TextField label="UAN Number" value={bank.uanNumber} onChange={(e) => setBank({ ...bank, uanNumber: e.target.value })} fullWidth />
            </div>
          )}

          {/* Footer nav */}
          <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
            <Button variant="ghost" onClick={back} disabled={active === 0}><ArrowLeft size={16} /> Back</Button>
            {active === 0 && <Button loading={saving} onClick={() => run(() => savePersonal(personal), next)}>Save & Proceed <ArrowRight size={16} /></Button>}
            {active === 1 && <Button loading={saving} onClick={() => run(() => saveFamily(family), next)}>Save & Proceed <ArrowRight size={16} /></Button>}
            {active === 2 && <Button loading={saving} onClick={() => run(() => saveContact(contact), next)}>Save & Proceed <ArrowRight size={16} /></Button>}
            {active === 3 && <Button loading={saving} onClick={() => run(() => saveBank(bank), () => { navigate('/me'); })}><CheckCircle2 size={16} /> Finish Onboarding</Button>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
