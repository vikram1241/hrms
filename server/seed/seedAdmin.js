import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Company, { PLATFORM_SLUG } from '../models/Company.js';
import User from '../models/User.js';

/**
 * Seed the platform superadmin and one default company admin so a fresh
 * multi-tenant database is immediately usable. Idempotent: re-running resets
 * passwords / reactivates without duplicating records.
 *
 * Login uses a company code (slug):
 *   superadmin -> slug '_platform'
 *   company admin -> the seeded company slug (default 'xyz')
 *
 * Run with: npm run db:seed
 */
const upsertCompany = async (slug, name) => {
  let company = await Company.findOne({ slug });
  if (!company) company = await Company.create({ slug, name, status: 'active' });
  return company;
};

const upsertUser = async (company, { email, password, role, firstName, lastName }) => {
  let user = await User.findOne({ companyId: company._id, email });
  if (user) {
    user.password = password; // re-hashed by pre-save hook
    user.isActive = true;
    user.role = role;
    await user.save();
    console.log(`♻️  Reset ${role}: ${email} @ ${company.slug}`);
    return user;
  }
  user = await User.create({
    companyId: company._id,
    email,
    password,
    role,
    isActive: true,
    onboardingStage: 'completed',
    personalDetails: { firstName, lastName, dateOfBirth: new Date('1990-01-01'), gender: 'Prefer not to say' },
    contactInfo: {
      personalMobile: '0000000000',
      emergencyContactName: 'N/A',
      emergencyContactRelation: 'N/A',
      emergencyContactPhone: '0000000000',
      presentAddress: { street: 'HQ', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' },
      permanentAddress: { street: 'HQ', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' }
    }
  });
  console.log(`✅ Created ${role}: ${email} @ ${company.slug}`);
  return user;
};

const run = async () => {
  await connectDB();

  // Platform tenant + superadmin.
  const platform = await upsertCompany(PLATFORM_SLUG, 'Platform');
  await upsertUser(platform, {
    email: (process.env.SEED_SUPERADMIN_EMAIL || 'super@platform.local').toLowerCase(),
    password: process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMe!123',
    role: 'superadmin',
    firstName: 'Platform', lastName: 'Admin'
  });

  // Default company + admin.
  const companySlug = (process.env.SEED_COMPANY_SLUG || 'xyz').toLowerCase();
  const companyName = process.env.SEED_COMPANY_NAME || 'Mirus Med Sciences';
  const company = await upsertCompany(companySlug, companyName);
  await upsertUser(company, {
    email: (process.env.SEED_ADMIN_EMAIL || 'admin@xyz.com').toLowerCase(),
    password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!123',
    role: 'admin',
    firstName: process.env.SEED_ADMIN_FIRST_NAME || 'Admin',
    lastName: process.env.SEED_ADMIN_LAST_NAME || 'System'
  });

  console.log(`\n   Company code (slug) for login: "${companySlug}"  |  superadmin slug: "${PLATFORM_SLUG}"`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('❌ Seed failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
