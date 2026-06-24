import {
  LayoutDashboard, Users, FileText, Wallet, SlidersHorizontal,
  UserCircle, FileSignature, FolderLock, Users2, FileCheck2
} from 'lucide-react';

// Navigation per role. `end` forces exact matching for index routes.
export const NAV = {
  admin: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/users', label: 'User Management', icon: Users },
    { to: '/offers', label: 'Offer Letters', icon: FileText },
    { to: '/payslips', label: 'Salary Slips', icon: Wallet },
    { to: '/verifications', label: 'Verifications', icon: FileCheck2 },
    { to: '/templates', label: 'Setup Templates', icon: SlidersHorizontal }
  ],
  hr: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/users', label: 'User Management', icon: Users },
    { to: '/offers', label: 'Offer Letters', icon: FileText },
    { to: '/payslips', label: 'Salary Slips', icon: Wallet },
    { to: '/verifications', label: 'Verifications', icon: FileCheck2 },
    { to: '/templates', label: 'Setup Templates', icon: SlidersHorizontal }
  ],
  employee: [
    { to: '/me', label: 'My Profile', icon: UserCircle },
    { to: '/my-offer', label: 'Offer Letter', icon: FileSignature },
    { to: '/my-payslips', label: 'Salary Slips', icon: Wallet },
    { to: '/documents', label: 'Documents', icon: FolderLock },
    { to: '/team', label: 'My Team', icon: Users2 }
  ]
};

export const navFor = (role) => NAV[role] || NAV.employee;
