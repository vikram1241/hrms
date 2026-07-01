import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Pagination from '@mui/material/Pagination';
import Tooltip from '@mui/material/Tooltip';
import { Search, Plus, FileSpreadsheet, Eye, Send, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import DataGrid from '../../components/ui/DataGrid.jsx';
import CreateOfferDialog from './CreateOfferDialog.jsx';
import BulkUploadDialog from './BulkUploadDialog.jsx';
import { listOffers, updateOfferStatus, approveOffer, resendOffer, offerPdfUrl } from '../../api/offers.js';
import { OFFER_STATUSES } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function OffersPage() {
  const dispatch = useDispatch();
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [resp, setResp] = useState({ data: [], pagination: { total: 0, pages: 1 } });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setFilters((f) => ({ ...f, search: searchInput })); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      setResp(await listOffers({ ...filters, page, limit: 10 }));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchOffers(); }, [filters, page]);

  const changeStatus = async (offer, status) => {
    try {
      await updateOfferStatus(offer._id, status);
      dispatch(notifySuccess(`Offer marked ${status}.`));
      fetchOffers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    }
  };

  const resend = async (offer) => {
    try {
      await resendOffer(offer._id);
      dispatch(notifySuccess('Offer reminder re-sent.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    }
  };

  const approve = async (offer) => {
    try {
      const res = await approveOffer(offer._id);
      dispatch(notifySuccess(res.message || 'Offer approved — credentials emailed.'));
      fetchOffers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    }
  };

  const STATUS_COLOR = { sent: '#D97706', pending: '#0EA5E9', signed: '#7C3AED', accepted: '#16A34A', declined: '#DC2626' };

  const columnDefs = useMemo(() => [
    { headerName: 'Candidate', field: 'fullName', minWidth: 170, flex: 1.5 },
    { headerName: 'Email', field: 'candidateEmail', minWidth: 200, flex: 1.5 },
    { headerName: 'Position', field: 'position', minWidth: 150 },
    { headerName: 'Offer Date', field: 'offerDate', valueFormatter: (p) => fmtDate(p.value), maxWidth: 140 },
    {
      headerName: 'Status', field: 'status', filter: false, sortable: false, minWidth: 150,
      cellRenderer: (p) => (
        <Select
          value={p.data.status} size="small" variant="standard" disableUnderline
          onChange={(e) => changeStatus(p.data, e.target.value)}
          sx={{ fontSize: 13, fontWeight: 600, color: STATUS_COLOR[p.data.status], textTransform: 'capitalize' }}
        >
          {OFFER_STATUSES.map((s) => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
        </Select>
      )
    },
    {
      headerName: 'Actions', filter: false, sortable: false, maxWidth: 160,
      cellRenderer: (p) => (
        <div className="flex h-full items-center gap-1">
          <Tooltip title="View PDF"><a className="btn-ghost p-2 text-primary-600" href={offerPdfUrl(p.data._id)} target="_blank" rel="noreferrer"><Eye size={16} /></a></Tooltip>
          {p.data.status === 'signed' && <Tooltip title="Approve & issue credentials"><button className="btn-ghost p-2 text-success" onClick={() => approve(p.data)}><CheckCircle2 size={16} /></button></Tooltip>}
          {p.data.status !== 'accepted' && p.data.status !== 'signed' && <Tooltip title="Resend"><button className="btn-ghost p-2" onClick={() => resend(p.data)}><Send size={16} /></button></Tooltip>}
        </div>
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div>
      <PageHeader
        title="Offer Letters" subtitle={`${resp.pagination.total} offers`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setBulkOpen(true)}><FileSpreadsheet size={16} /> Bulk XLSX</Button>
            <Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Create Offer</Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder="Search candidate, email, position…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <TextField select size="small" label="Status" value={filters.status} onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}>
            <MenuItem value="">All statuses</MenuItem>
            {OFFER_STATUSES.map((s) => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
          </TextField>
        </div>
      </Card>

      <DataGrid rowData={resp.data} columnDefs={columnDefs} loading={loading} pagination={false} height={560} />

      <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted">Showing {resp.data.length} of {resp.pagination.total} offers</p>
        <Pagination count={resp.pagination.pages || 1} page={page} onChange={(_, p) => setPage(p)} color="primary" shape="rounded" />
      </div>

      <CreateOfferDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchOffers} />
      <BulkUploadDialog open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={fetchOffers} />
    </div>
  );
}
