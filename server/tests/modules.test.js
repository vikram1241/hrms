import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent } from './helpers/factories.js';
import ExcelJS from 'exceljs';
import { computeStatutoryDeductions, computePF } from '../utils/statutoryEngine.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

// Shared setup: an admin (all permissions) and an employee in the same company.
const setup = async () => {
  const { agent: admin } = await authAgent(app, { email: 'admin@xyz.com', role: 'admin' });
  const { agent: emp, user: employee } = await authAgent(app, { email: 'emp@xyz.com', role: 'employee' });
  return { admin, emp, employee };
};

test('Epic 11 — attendance mark + leave apply/approve + holiday', async () => {
  const { admin, emp, employee } = await setup();

  assert.equal((await emp.post('/api/attendance/mark').send({ date: '2026-07-01', status: 'Present' })).status, 200);
  assert.equal((await admin.get('/api/attendance').query({ userId: String(employee._id) })).body.data.length, 1);

  const leave = await emp.post('/api/leaves').send({ type: 'Casual', fromDate: '2026-07-10', toDate: '2026-07-11', reason: 'Personal' });
  assert.equal(leave.status, 201);
  const decided = await admin.patch(`/api/leaves/${leave.body.leave._id}/decision`).send({ status: 'Approved' });
  assert.equal(decided.body.leave.status, 'Approved');

  assert.equal((await admin.post('/api/holidays').send({ date: '2026-08-15', name: 'Independence Day' })).status, 201);
  assert.equal((await emp.get('/api/holidays').query({ year: 2026 })).body.data.length, 1);
});

test('Epic C — company config: admin can update, HR cannot', async () => {
  const { admin } = await setup();
  const { agent: hr } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });

  assert.equal((await admin.get('/api/company')).status, 200);
  const upd = await admin.put('/api/company').send({ statutory: { pfNumber: 'PF123', esiNumber: 'ESI9' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.company.statutory.pfNumber, 'PF123');

  assert.equal((await hr.put('/api/company').send({ name: 'Hacked' })).status, 403); // HR lacks company:manage
});

test('Epic 10 — issue a handbook doc and employee acknowledges', async () => {
  const { admin, emp, employee } = await setup();
  const issued = await admin.post('/api/employee-docs').send({ userId: employee._id, type: 'Handbook' });
  assert.equal(issued.status, 201);
  assert.equal(issued.body.document.status, 'issued');

  const ack = await emp.post(`/api/employee-docs/${issued.body.document._id}/acknowledge`).send({ agree: true });
  assert.equal(ack.status, 200);
  assert.equal(ack.body.document.status, 'acknowledged');

  assert.equal((await emp.get('/api/employee-docs/mine')).body.data.length, 1);
});

test('Epic 17 — uploadable doc type (read) + upload + accept', async () => {
  const { admin, emp, employee } = await setup();
  const type = await admin.post('/api/uploaded-docs/types').send({ name: 'Form 16', section: 'Tax', kind: 'read', termsText: 'Please confirm receipt.' });
  assert.equal(type.status, 201);

  const pdf = Buffer.from('%PDF-1.4 test');
  const uploaded = await admin.post('/api/uploaded-docs')
    .field('userId', String(employee._id))
    .field('documentTypeId', String(type.body.type._id))
    .attach('document', pdf, { filename: 'form16.pdf', contentType: 'application/pdf' });
  assert.equal(uploaded.status, 201);

  const accept = await emp.post(`/api/uploaded-docs/${uploaded.body.record._id}/accept`).send({ agree: true });
  assert.equal(accept.status, 200);
  assert.equal(accept.body.record.status, 'acknowledged');
});

test('Epic 12 — performance review published is visible to the employee', async () => {
  const { admin, emp, employee } = await setup();
  const review = await admin.post('/api/performance/reviews').send({
    userId: employee._id, period: 'Q1-2026', overallRating: 4, status: 'Published',
    kpis: [{ title: 'Delivery', target: '100%', achieved: '95%', score: 4 }]
  });
  assert.equal(review.status, 201);
  assert.equal((await emp.get('/api/performance/reviews/mine')).body.data.length, 1);
});

test('Epic 18 — training section create + list', async () => {
  const { admin, emp } = await setup();
  assert.equal((await admin.post('/api/training/sections').send({ title: 'Onboarding' })).status, 201);
  assert.equal((await emp.get('/api/training/sections')).body.data.length, 1);
});

test('Epic 13 — asset register: assign then return', async () => {
  const { admin, emp, employee } = await setup();
  const asset = await admin.post('/api/assets').send({ tag: 'LAP-001', type: 'Laptop' });
  assert.equal(asset.status, 201);

  const assigned = await admin.post(`/api/assets/${asset.body.asset._id}/assign`).send({ userId: employee._id });
  assert.equal(assigned.body.asset.status, 'Assigned');
  assert.equal((await emp.get('/api/assets/mine')).body.data.length, 1);

  const returned = await admin.post(`/api/assets/${asset.body.asset._id}/return`).send({ condition: 'Good' });
  assert.equal(returned.body.asset.status, 'Returned');
});

test('Epic 14 — exit initiate + generate letters', async () => {
  const { admin, employee } = await setup();
  const exit = await admin.post('/api/exits').send({ userId: employee._id, resignationDate: '2026-07-01', lastWorkingDay: '2026-07-31', reason: 'Growth' });
  assert.equal(exit.status, 201);
  const letters = await admin.post(`/api/exits/${exit.body.record._id}/letters`);
  assert.equal(letters.status, 200);
  assert.ok(letters.body.relievingLetterUrl && letters.body.experienceLetterUrl);
});

test('Employee 360 — admin gets a consolidated section-wise overview', async () => {
  const { admin, emp, employee } = await setup();
  // Seed a couple of sections' data.
  await emp.post('/api/attendance/mark').send({ date: '2026-07-01', status: 'Present' });
  await admin.post('/api/performance/reviews').send({ userId: employee._id, period: 'Q1-2026', overallRating: 4, status: 'Published' });

  const res = await admin.get(`/api/users/${employee._id}/overview`);
  assert.equal(res.status, 200);
  assert.equal(res.body.user._id, String(employee._id));
  // Every section key is present.
  for (const k of ['compensation', 'payslips', 'attendance', 'leaves', 'performance', 'assets', 'documents', 'exit']) {
    assert.ok(k in res.body, `overview missing section: ${k}`);
  }
  assert.equal(res.body.attendance.length, 1);
  assert.equal(res.body.performance.reviews.length, 1);

  // Employees cannot use the admin overview endpoint.
  assert.equal((await emp.get(`/api/users/${employee._id}/overview`)).status, 403);
});

test('Letter templates — set up offer/appointment/service/FNF templates', async () => {
  const { admin, emp } = await setup();
  const created = await admin.post('/api/letter-templates').send({
    type: 'FNFLetter', name: 'Standard FNF', title: 'Full & Final Settlement',
    bodyParagraphs: ['Dear {{employeeName}}, your full and final settlement is enclosed.']
  });
  assert.equal(created.status, 201);

  const list = await admin.get('/api/letter-templates');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  assert.ok(list.body.meta.types.includes('ServiceLetter'));
  assert.ok(list.body.meta.placeholders.includes('employeeName'));

  // Employees cannot manage letter templates.
  assert.equal((await emp.get('/api/letter-templates')).status, 403);
});

test('Bulk attendance — mark many employees for a day in one call', async () => {
  const { admin } = await setup();
  const { user: a } = await authAgent(app, { email: 'a@xyz.com', role: 'employee' });
  const { user: b } = await authAgent(app, { email: 'b@xyz.com', role: 'employee' });

  const res = await admin.post('/api/attendance/bulk').send({ userIds: [String(a._id), String(b._id)], date: '2026-07-05', status: 'Present' });
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 2);
  assert.equal((await admin.get('/api/attendance').query({ userId: String(a._id) })).body.data.length, 1);
});

test('Bulk attendance — import from an .xlsx roster (by employeeId/email)', async () => {
  const { admin } = await setup();
  const { user } = await authAgent(app, { email: 'imp@xyz.com', role: 'employee', employeeDetails: { employeeId: 'EMP90001' } });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['employeeId', 'email', 'date', 'status', 'checkIn', 'checkOut']);
  ws.addRow(['EMP90001', '', '2026-07-05', 'Present', '09:30', '18:30']);
  ws.addRow(['', 'imp@xyz.com', '2026-07-06', 'Half-Day', '', '']);
  ws.addRow(['NOPE999', '', '2026-07-07', 'Present', '', '']); // unknown → failed row
  const buffer = await wb.xlsx.writeBuffer();

  const res = await admin.post('/api/attendance/bulk-upload')
    .attach('roster', Buffer.from(buffer), { filename: 'att.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(res.status, 201);
  assert.equal(res.body.imported.length, 2);
  assert.equal(res.body.failed.length, 1);
  assert.equal((await admin.get('/api/attendance').query({ userId: String(user._id) })).body.data.length, 2);
});

test('Epic 16 — statutory engine computes PF/ESI/PT/TDS', () => {
  // Basic ₹45,000 => PF = 12% of min(45000,15000) = ₹1,800 = 180000 paisa.
  assert.equal(computePF(4_500_000), 180_000);
  const { deductions } = computeStatutoryDeductions({ basicPaisa: 4_500_000, grossPaisa: 10_000_000, absentDays: 0, workingDays: 30 });
  const labels = deductions.map((d) => d.label);
  assert.ok(labels.includes('Provident Fund (PF)'));
  assert.ok(labels.includes('Professional Tax'));
  assert.ok(labels.includes('TDS'));
});
