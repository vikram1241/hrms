import request from 'supertest';
import User from '../../models/User.js';

/**
 * Minimal valid User payload. Override any slice via `overrides`.
 * Mirrors the required fields of the User schema so .create() succeeds.
 */
export const buildUser = (overrides = {}) => {
  const base = {
    email: `user_${Math.floor(performance.now() * 1000)}@xyz.com`,
    password: 'Password1',
    role: 'employee',
    isActive: true,
    personalDetails: {
      firstName: 'Test',
      lastName: 'User',
      dateOfBirth: new Date('1992-05-10'),
      gender: 'Male'
    },
    contactInfo: {
      personalMobile: '9876543210',
      emergencyContactName: 'Kin',
      emergencyContactRelation: 'Sibling',
      emergencyContactPhone: '9876500000',
      presentAddress: { street: '1 St', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' },
      permanentAddress: { street: '1 St', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' }
    }
  };
  // Shallow-merge nested objects so callers can override one leaf at a time.
  return {
    ...base,
    ...overrides,
    personalDetails: { ...base.personalDetails, ...(overrides.personalDetails || {}) },
    contactInfo: { ...base.contactInfo, ...(overrides.contactInfo || {}) },
    employeeDetails: { ...(base.employeeDetails || {}), ...(overrides.employeeDetails || {}) }
  };
};

export const createUser = (overrides = {}) => User.create(buildUser(overrides));

/**
 * Create a user and return a supertest agent whose cookie jar holds a valid
 * session. `password` must match what was set (default 'Password1').
 */
export const authAgent = async (app, overrides = {}) => {
  const password = overrides.password || 'Password1';
  const user = await createUser({ ...overrides, password });
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password });
  if (res.status !== 200) {
    throw new Error(`authAgent login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { agent, user };
};
