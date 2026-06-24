import { FileSignature, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';

// Authenticated employees have already accepted their offer (that is how they
// obtained an account). The interactive accept/e-sign surface lives on the
// public magic-link portal (/offer/:token). This page summarizes that status.
export default function MyOfferPage() {
  return (
    <div>
      <PageHeader title="Offer Letter" subtitle="Your employment offer status" />
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 size={26} /></div>
          <h3 className="text-lg font-semibold text-ink">Offer Accepted</h3>
          <p className="flex max-w-md items-center gap-2 text-sm text-muted">
            <FileSignature size={16} /> Your signed offer letter is on file with HR. Reach out to People Ops for a certified copy.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
