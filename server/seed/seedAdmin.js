import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';

/**
 * Seed an initial active admin account so the portal is reachable on a fresh
 * database. Idempotent: re-running only resets the password / reactivates.
 * Run with: npm run db:seed
 */
const run = async () => {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@xyz.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!123';
  const firstName = process.env.SEED_ADMIN_FIRST_NAME || 'Admin';
  const lastName = process.env.SEED_ADMIN_LAST_NAME || 'System';

  await connectDB();

  let admin = await User.findOne({ email });

  if (admin) {
    admin.password = password; // re-hashed by the pre-save hook
    admin.isActive = true;
    admin.role = 'admin';
    await admin.save();
    console.log(`♻️  Existing admin reset & reactivated: ${email}`);
  } else {
    admin = await User.create({
      email,
      password,
      role: 'admin',
      isActive: true,
      personalDetails: {
        firstName,
        lastName,
        dateOfBirth: new Date('1990-01-01'),
        gender: 'Prefer not to say'
      },
      contactInfo: {
        personalMobile: '0000000000',
        emergencyContactName: 'N/A',
        emergencyContactRelation: 'N/A',
        emergencyContactPhone: '0000000000',
        presentAddress: { street: 'HQ', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' },
        permanentAddress: { street: 'HQ', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' }
      }
    });
    console.log(`✅ Admin created: ${email}`);
  }

  console.log('   Use the seeded credentials to log in, then change the password.');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('❌ Seed failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
