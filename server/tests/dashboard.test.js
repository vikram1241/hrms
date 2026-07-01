import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser } from './helpers/factories.js';
import OfferLetter from '../models/OfferLetter.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('dashboard stats are admin/HR only', async () => {
  const { agent } = await authAgent(app, { email: 'emp@xyz.com', role: 'employee' });
  const res = await agent.get('/api/dashboard/stats');
  assert.equal(res.status, 403);
});

test('dashboard stats aggregate employees, pending offers and pending verifications', async () => {
  const { agent, company } = await authAgent(app, { email: 'admin@xyz.com', role: 'admin' });
  const cid = company._id;

  await createUser({ email: 'e1@xyz.com', role: 'employee' });
  await createUser({
    email: 'e2@xyz.com', role: 'employee',
    uploadedDocuments: [{ documentType: 'PAN', documentNumber: 'ABCDE1234F', fileUrl: 'uploads/documents/x.pdf', verificationStatus: 'Pending' }]
  });

  // A pending offer needs a salary assignment to satisfy the schema.
  const tpl = await SalaryStructureTemplate.create({ companyId: cid, name: 'T', earningsStructure: [], deductionsStructure: [] });
  const u = await createUser({ email: 'cand@xyz.com', role: 'employee', isActive: false });
  const asn = await EmployeeSalaryAssignment.create({
    companyId: cid, userId: u._id, templateId: tpl._id, annualCTC: 1200000,
    frozenMonthlyBreakdown: { earnings: [], deductions: [], grossEarnings: 0, totalDeductions: 0, netTakeHome: 0 }
  });
  await OfferLetter.create({
    companyId: cid, candidateEmail: 'cand@xyz.com', fullName: 'Cand', position: 'Dev', department: 'Engineering',
    joiningDate: new Date(), salaryAssignmentId: asn._id, status: 'sent', pdfFileUrl: 'uploads/offers/o.pdf'
  });

  const res = await agent.get('/api/dashboard/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.stats.totalEmployees, 3); // e1, e2, cand (admin is role 'admin', excluded)
  assert.equal(res.body.stats.pendingOffers, 1);
  assert.equal(res.body.stats.pendingVerifications, 1);
});
