import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent } from './helpers/factories.js';
import { clearOutbox, getOutbox } from '../services/emailService.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';

// 1x1 transparent PNG (valid base64 for signature baking).
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); clearOutbox(); });

const stageOffer = async () => {
  const { agent } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });
  await SalaryStructureTemplate.create({
    name: 'Eng',
    earningsStructure: [
      { key: 'basic', label: 'Basic', calculationType: 'percentage_of_ctc', valueFactor: 45 },
      { key: 'special', label: 'Special', calculationType: 'balance_of_ctc', valueFactor: 0 }
    ],
    deductionsStructure: [{ key: 'pf', label: 'PF', calculationType: 'percentage_of_basic', valueFactor: 12 }]
  });
  const tpl = await SalaryStructureTemplate.findOne({ name: 'Eng' });
  const res = await agent.post('/api/offers').send({
    candidateEmail: 'cand@example.com', fullName: 'Vikram Singh', position: 'Designer',
    department: 'Design', joiningDate: '2026-07-15', templateId: tpl._id, annualCTC: 1200000
  });
  return res.body.accessToken;
};

test('candidate views offer + compensation breakdown via magic link', async () => {
  const token = await stageOffer();
  const res = await request(app).get(`/api/candidate/offer/${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.offer.fullName, 'Vikram Singh');
  assert.equal(res.body.compensation.netTakeHome, 9440000);
  assert.match(res.body.compensation.netTakeHomeDisplay, /INR/);
});

test('invalid token is rejected with 401', async () => {
  const res = await request(app).get('/api/candidate/offer/deadbeef');
  assert.equal(res.status, 401);
});

test('full e-sign acceptance flow then credential setup and login', async () => {
  const token = await stageOffer();

  const sign = await request(app).post(`/api/candidate/offer/${token}/sign`).send({ signatureBase64: SIGNATURE });
  assert.equal(sign.status, 200);
  assert.ok(sign.body.signedPdfFileUrl);
  assert.ok(sign.body.verificationToken);
  assert.ok(sign.body.passwordSetupToken, 'setup token issued');
  assert.equal(getOutbox().filter((m) => m.meta.type === 'password_setup').length, 1);

  // Magic link is single-use: re-signing fails.
  const reuse = await request(app).post(`/api/candidate/offer/${token}/sign`).send({ signatureBase64: SIGNATURE });
  assert.equal(reuse.status, 401);

  // Account is inactive until the password is set.
  const earlyLogin = await request(app).post('/api/auth/login').send({ email: 'cand@example.com', password: 'NewPass123' });
  assert.equal(earlyLogin.status, 401);

  const setup = await request(app).post('/api/candidate/setup-password')
    .send({ token: sign.body.passwordSetupToken, password: 'NewPass123' });
  assert.equal(setup.status, 200);

  const login = await request(app).post('/api/auth/login').send({ email: 'cand@example.com', password: 'NewPass123' });
  assert.equal(login.status, 200);
});

test('weak password is rejected at setup', async () => {
  const token = await stageOffer();
  const sign = await request(app).post(`/api/candidate/offer/${token}/sign`).send({ signatureBase64: SIGNATURE });
  const setup = await request(app).post('/api/candidate/setup-password')
    .send({ token: sign.body.passwordSetupToken, password: 'weak' });
  assert.equal(setup.status, 400);
});
