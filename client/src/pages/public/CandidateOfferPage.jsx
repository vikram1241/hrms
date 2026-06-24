import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { CheckCircle2, Eraser, PenLine, ShieldCheck } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import { getOfferByToken, signOffer } from '../../api/candidate.js';
import SignaturePad from '../../components/feature/SignaturePad.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

function Branded({ children }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 font-extrabold text-white">X</div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-ink">XYZ Software Solutions</p>
            <p className="text-xs text-muted">Career Offer Portal</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}

const Money = ({ rows, label }) => (
  <div>
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex justify-between gap-3"><span className="text-muted">{r.label}</span><span className="font-medium text-ink">{r.display}</span></li>
      ))}
    </ul>
  </div>
);

export default function CandidateOfferPage() {
  const { token } = useParams();
  const dispatch = useDispatch();
  const padRef = useRef(null);
  const { data, loading, error } = useAsync(() => getOfferByToken(token), [token]);
  const [empty, setEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  if (loading) return <Branded><div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div></Branded>;
  if (error) return <Branded><div className="rounded-xl border border-danger/20 bg-danger-soft p-6 text-center text-danger">{error}</div></Branded>;

  if (result) {
    return (
      <Branded>
        <div className="mx-auto max-w-md rounded-xl border border-line bg-white p-8 text-center shadow-card animate-fade-in">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 size={36} /></div>
          <h2 className="text-xl font-bold text-ink">Offer Accepted!</h2>
          <p className="mt-2 text-sm text-muted">Congratulations and welcome aboard. Your signed contract has been recorded.</p>
          {result.setupUrl ? (
            <Link to={result.setupUrl.replace(window.location.origin, '')} className="btn-primary mt-6 w-full">Set up your account</Link>
          ) : (
            <p className="mt-6 rounded-lg bg-primary-50 p-3 text-sm text-primary-800">Check your email for a link to set up your employee account.</p>
          )}
        </div>
      </Branded>
    );
  }

  const { offer, compensation } = data;

  const accept = async () => {
    if (padRef.current?.isEmpty()) return dispatch({ type: 'noop' }) || alert('Please draw your signature first.');
    setSubmitting(true);
    try {
      const res = await signOffer(token, padRef.current.toDataURL());
      setResult(res);
    } catch (err) {
      alert(err.uiMessage || 'Could not submit signature.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Branded>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Welcome, {offer.fullName.split(' ')[0]} 👋</h1>
        <p className="text-muted">Review your offer for <span className="font-semibold text-ink">{offer.position}</span> and sign to accept.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Offer + compensation */}
        <div className="space-y-6 lg:col-span-3">
          <div className="rounded-xl border border-line bg-white p-6 shadow-card">
            <h3 className="mb-4 text-base font-semibold text-ink">Employment Details</h3>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-muted">Position</dt><dd className="font-medium text-ink">{offer.position}</dd>
              <dt className="text-muted">Department</dt><dd className="font-medium text-ink">{offer.department}</dd>
              <dt className="text-muted">Joining Date</dt><dd className="font-medium text-ink">{new Date(offer.joiningDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</dd>
              <dt className="text-muted">Annual CTC</dt><dd className="font-bold text-primary-700">{compensation?.annualCTCDisplay}</dd>
            </dl>
          </div>

          {compensation && (
            <div className="rounded-xl border border-line bg-white p-6 shadow-card">
              <h3 className="mb-4 text-base font-semibold text-ink">Monthly Compensation Breakdown</h3>
              <div className="grid grid-cols-2 gap-6">
                <Money label="Earnings" rows={compensation.earnings} />
                <Money label="Deductions" rows={compensation.deductions} />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                <span className="text-sm text-muted">Net Take-Home (monthly)</span>
                <span className="text-lg font-bold text-primary-700">{compensation.netTakeHomeDisplay}</span>
              </div>
            </div>
          )}
        </div>

        {/* Signature */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-line bg-white p-6 shadow-card">
            <div className="mb-3 flex items-center gap-2 text-ink"><PenLine size={18} className="text-primary-600" /><h3 className="text-base font-semibold">Sign to Accept</h3></div>
            <SignaturePad ref={padRef} height={180} onChange={setEmpty} />
            <button onClick={() => padRef.current?.clear()} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary-600">
              <Eraser size={14} /> Clear
            </button>
            <Button className="mt-4 w-full" onClick={accept} loading={submitting} disabled={empty}>
              <CheckCircle2 size={16} /> Accept &amp; Execute Contract
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck size={14} /> Your signature is cryptographically hashed &amp; timestamped.</p>
          </div>
        </div>
      </div>
    </Branded>
  );
}
