import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { bootstrapAuth, selectUser } from './features/auth/authSlice.js';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import Toaster from './components/ui/Toaster.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import CandidateOfferPage from './pages/public/CandidateOfferPage.jsx';
import SetupPasswordPage from './pages/public/SetupPasswordPage.jsx';

import UsersPage from './features/users/UsersPage.jsx';
import OffersPage from './features/offers/OffersPage.jsx';
import TemplatesPage from './features/salary/TemplatesPage.jsx';
import PayslipsPage from './features/salary/PayslipsPage.jsx';
import VerificationsPage from './features/verifications/VerificationsPage.jsx';

import EmployeeHub from './features/employee/EmployeeHub.jsx';
import MyPayslipsPage from './features/employee/MyPayslipsPage.jsx';
import MyOfferPage from './features/employee/MyOfferPage.jsx';
import MyTeamPage from './features/employee/MyTeamPage.jsx';
import OnboardingPage from './features/onboarding/OnboardingPage.jsx';
import DocumentsPage from './features/documents/DocumentsPage.jsx';

const MANAGER = ['admin', 'hr'];

function RoleIndex() {
  const user = useSelector(selectUser);
  return <Navigate to={MANAGER.includes(user?.role) ? '/dashboard' : '/me'} replace />;
}

export default function App() {
  const dispatch = useDispatch();
  useEffect(() => { dispatch(bootstrapAuth()); }, [dispatch]);

  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/offer/:token" element={<CandidateOfferPage />} />
        <Route path="/setup-password/:token" element={<SetupPasswordPage />} />

        {/* Authenticated shell */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<RoleIndex />} />

          {/* Admin / HR */}
          <Route path="dashboard" element={<ProtectedRoute roles={MANAGER}><Dashboard /></ProtectedRoute>} />
          <Route path="users" element={<ProtectedRoute roles={MANAGER}><UsersPage /></ProtectedRoute>} />
          <Route path="offers" element={<ProtectedRoute roles={MANAGER}><OffersPage /></ProtectedRoute>} />
          <Route path="payslips" element={<ProtectedRoute roles={MANAGER}><PayslipsPage /></ProtectedRoute>} />
          <Route path="verifications" element={<ProtectedRoute roles={MANAGER}><VerificationsPage /></ProtectedRoute>} />
          <Route path="templates" element={<ProtectedRoute roles={MANAGER}><TemplatesPage /></ProtectedRoute>} />

          {/* Shared */}
          <Route path="profile" element={<Profile />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="documents" element={<DocumentsPage />} />

          {/* Employee */}
          <Route path="me" element={<EmployeeHub />} />
          <Route path="my-offer" element={<MyOfferPage />} />
          <Route path="my-payslips" element={<MyPayslipsPage />} />
          <Route path="team" element={<MyTeamPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
