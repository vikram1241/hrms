import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { createUser } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('login succeeds, sets HTTP-only cookie, hides password', async () => {
  await createUser({ email: 'admin@xyz.com', password: 'Password1', role: 'admin' });
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@xyz.com', password: 'Password1' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.user.password, undefined);
  const cookie = res.headers['set-cookie']?.[0] || '';
  assert.match(cookie, /hrms_token=/);
  assert.match(cookie, /HttpOnly/i);
});

test('wrong password returns generic 401', async () => {
  await createUser({ email: 'a@xyz.com', password: 'Password1' });
  const res = await request(app).post('/api/auth/login').send({ email: 'a@xyz.com', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.message, 'Invalid email or password');
});

test('unknown email returns the same generic 401 (no enumeration)', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'nope@xyz.com', password: 'whatever' });
  assert.equal(res.status, 401);
  assert.equal(res.body.message, 'Invalid email or password');
});

test('deactivated account is rejected with 403', async () => {
  await createUser({ email: 'off@xyz.com', password: 'Password1', isActive: false });
  const res = await request(app).post('/api/auth/login').send({ email: 'off@xyz.com', password: 'Password1' });
  assert.equal(res.status, 403);
});

test('missing email fails validation with 400', async () => {
  const res = await request(app).post('/api/auth/login').send({ password: 'Password1' });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'Validation failed');
});

test('/api/auth/me requires authentication', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
});

test('full session lifecycle: login -> me -> logout -> me 401', async () => {
  await createUser({ email: 'flow@xyz.com', password: 'Password1' });
  const agent = request.agent(app);

  const login = await agent.post('/api/auth/login').send({ email: 'flow@xyz.com', password: 'Password1' });
  assert.equal(login.status, 200);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'flow@xyz.com');

  const out = await agent.post('/api/auth/logout');
  assert.equal(out.status, 200);

  const after = await agent.get('/api/auth/me');
  assert.equal(after.status, 401);
});
