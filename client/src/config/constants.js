export const DEPARTMENTS = ['Engineering', 'HR', 'Sales', 'Marketing', 'Finance', 'Operations', 'Design'];
export const ROLES = ['admin', 'hr', 'employee'];
export const DOC_TYPES = ['Aadhar', 'PAN', 'Passport', 'VoterID', 'DegreeCertificate', 'RelievingLetter', 'Payslip'];
export const OFFER_STATUSES = ['sent', 'pending', 'accepted', 'declined'];
export const CALC_TYPES = [
  { value: 'fixed', label: 'Fixed amount (₹)' },
  { value: 'percentage_of_ctc', label: '% of CTC' },
  { value: 'percentage_of_basic', label: '% of Basic' },
  { value: 'balance_of_ctc', label: 'Balance of CTC' }
];
export const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
];
export const YEARS = [2024, 2025, 2026, 2027];

export const fullName = (u) =>
  `${u?.personalDetails?.firstName || ''} ${u?.personalDetails?.lastName || ''}`.trim() || '—';
