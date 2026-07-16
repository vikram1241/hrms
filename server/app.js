import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import userRoutes from './routes/userRoutes.js';
import salaryTemplateRoutes from './routes/salaryTemplateRoutes.js';
import salaryAssignmentRoutes from './routes/salaryAssignmentRoutes.js';
import payslipRoutes from './routes/payslipRoutes.js';
import offerRoutes from './routes/offerRoutes.js';
import candidateRoutes from './routes/candidateRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import selfServiceRoutes from './routes/selfServiceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import employeeDocumentRoutes from './routes/employeeDocumentRoutes.js';
import uploadedDocumentRoutes from './routes/uploadedDocumentRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import trainingRoutes from './routes/trainingRoutes.js';
import assetRoutes from './routes/assetRoutes.js';
import exitRoutes from './routes/exitRoutes.js';
import letterTemplateRoutes from './routes/letterTemplateRoutes.js';
import cfTemplateRoutes from './routes/cfTemplateRoutes.js';
import cfIssueRoutes from './routes/cfIssueRoutes.js';
import jobRoleRoutes from './routes/jobRoleRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { tenantContextMiddleware } from './utils/tenantContext.js';
import { corsOrigins } from './utils/clientOrigin.js';

const app = express();

const allowedOrigins = corsOrigins();
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser clients (no Origin) and configured SPA origins.
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true // allow the HTTP-only auth cookie across origins
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Establish a per-request tenant context store (Epic T) before any route runs.
app.use(tenantContextMiddleware);

// Avatars are public assets; sensitive documents are NOT served from here.
app.use('/uploads/avatars', express.static(path.resolve('uploads', 'avatars')));

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

app.use('/api/tenants', tenantRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/salary-templates', salaryTemplateRoutes);
app.use('/api/salary-assignments', salaryAssignmentRoutes);
app.use('/api/payslips', payslipRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/self-service', selfServiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/employee-docs', employeeDocumentRoutes);
app.use('/api/uploaded-docs', uploadedDocumentRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/exits', exitRoutes);
app.use('/api/letter-templates', letterTemplateRoutes);
app.use('/api/cf-templates', cfTemplateRoutes);
app.use('/api/cf-issues', cfIssueRoutes);
app.use('/api/job-roles', jobRoleRoutes);
// Attendance/leaves/holidays share one router with absolute subpaths.
app.use('/api', attendanceRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
