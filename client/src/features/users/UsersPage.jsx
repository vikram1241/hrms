import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import { Search, Pencil, Trash2, Wallet, RotateCcw } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import DataGrid from '../../components/ui/DataGrid.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EditUserDialog from './EditUserDialog.jsx';
import AssignSalaryDialog from './AssignSalaryDialog.jsx';
import { listUsers, deleteUser, restoreUser } from '../../api/users.js';
import { DEPARTMENTS, ROLES, fullName } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const RoleChip = ({ value }) => <span className="badge-neutral capitalize">{value}</span>;

const NameCell = ({ data }) => (
  <div className="flex items-center gap-2.5">
    <Avatar src={data.personalDetails?.profilePictureUrl} name={fullName(data)} size={32} />
    <div className="leading-tight">
      <p className="font-medium text-ink">{fullName(data)}</p>
      <p className="text-xs text-muted">{data.email}</p>
    </div>
  </div>
);

const StatusCell = ({ data }) => {
  if (data.deletedAt) return <StatusBadge status="rejected" label="Deleted" />;
  return <StatusBadge status={data.isActive ? 'active' : 'inactive'} />;
};

export default function UsersPage() {
  const dispatch = useDispatch();
  const [filters, setFilters] = useState({ search: '', role: '', status: '', department: '', includeDeleted: false });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [resp, setResp] = useState({ data: [], pagination: { total: 0, pages: 1 } });
  const [loading, setLoading] = useState(true);

  const [editUser, setEditUser] = useState(null);
  const [assignUser, setAssignUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce the search box into filters.
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setFilters((f) => ({ ...f, search: searchInput })); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await listUsers({ ...filters, includeDeleted: filters.includeDeleted ? 'true' : undefined, page, limit: 10 });
      setResp(data);
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); }, [filters, page]);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteUser(deleteTarget._id);
      dispatch(notifySuccess('User soft-deleted.'));
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setDeleting(false);
    }
  };

  const onRestore = async (row) => {
    try {
      await restoreUser(row._id);
      dispatch(notifySuccess('User restored.'));
      fetchUsers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    }
  };

  const columnDefs = useMemo(() => [
    { headerName: 'ID', valueGetter: (p) => p.data.employeeDetails?.employeeId || '—', maxWidth: 130 },
    { headerName: 'Name', valueGetter: (p) => fullName(p.data), cellRenderer: NameCell, minWidth: 240, flex: 2 },
    { headerName: 'Department', valueGetter: (p) => p.data.employeeDetails?.department || '—' },
    { headerName: 'Role', field: 'role', cellRenderer: RoleChip, maxWidth: 140 },
    { headerName: 'Status', cellRenderer: StatusCell, filter: false, sortable: false, maxWidth: 150 },
    {
      headerName: 'Actions', filter: false, sortable: false, minWidth: 150, maxWidth: 180,
      cellRenderer: (p) => (
        <div className="flex h-full items-center gap-1">
          {p.data.deletedAt ? (
            <Tooltip title="Restore"><button className="btn-ghost p-2" onClick={() => onRestore(p.data)}><RotateCcw size={16} /></button></Tooltip>
          ) : (
            <>
              <Tooltip title="Edit"><button className="btn-ghost p-2" onClick={() => setEditUser(p.data)}><Pencil size={16} /></button></Tooltip>
              <Tooltip title="Assign salary"><button className="btn-ghost p-2 text-primary-600" onClick={() => setAssignUser(p.data)}><Wallet size={16} /></button></Tooltip>
              <Tooltip title="Delete"><button className="btn-ghost p-2 text-danger" onClick={() => setDeleteTarget(p.data)}><Trash2 size={16} /></button></Tooltip>
            </>
          )}
        </div>
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div>
      <PageHeader title="User Management" subtitle={`${resp.pagination.total} users in the directory`} />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder="Search by name, ID, email…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <TextField select size="small" label="Role" value={filters.role} onChange={(e) => { setPage(1); setFilters({ ...filters, role: e.target.value }); }}>
            <MenuItem value="">All roles</MenuItem>
            {ROLES.map((r) => <MenuItem key={r} value={r} sx={{ textTransform: 'capitalize' }}>{r}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Status" value={filters.status} onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}>
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
          <TextField select size="small" label="Department" value={filters.department} onChange={(e) => { setPage(1); setFilters({ ...filters, department: e.target.value }); }}>
            <MenuItem value="">All departments</MenuItem>
            {DEPARTMENTS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
        </div>
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Checkbox size="small" checked={filters.includeDeleted} onChange={(e) => { setPage(1); setFilters({ ...filters, includeDeleted: e.target.checked }); }} />}
          label={<span className="text-sm text-muted">Show soft-deleted users</span>}
        />
      </Card>

      <DataGrid rowData={resp.data} columnDefs={columnDefs} loading={loading} pagination={false} height={560} />

      <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted">
          Showing {resp.data.length} of {resp.pagination.total} entries
        </p>
        <Pagination count={resp.pagination.pages || 1} page={page} onChange={(_, p) => setPage(p)} color="primary" shape="rounded" />
      </div>

      <EditUserDialog open={Boolean(editUser)} user={editUser} onClose={() => setEditUser(null)} onSaved={fetchUsers} />
      <AssignSalaryDialog open={Boolean(assignUser)} user={assignUser} onClose={() => setAssignUser(null)} />
      <ConfirmDialog
        open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} loading={deleting}
        title="Delete user?" confirmLabel="Delete"
        message={deleteTarget ? `${fullName(deleteTarget)} will be soft-deleted and hidden from the directory. You can restore them later.` : ''}
      />
    </div>
  );
}
