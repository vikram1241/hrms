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
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true // allow the HTTP-only auth cookie across origins
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Avatars are public assets; sensitive documents are NOT served from here.
app.use('/uploads/avatars', express.static(path.resolve('uploads', 'avatars')));

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

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

app.use(notFound);
app.use(errorHandler);

export default app;
