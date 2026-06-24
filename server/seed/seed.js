import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import OfferLetter from '../models/OfferLetter.js';
import SalarySlip from '../models/SalarySlip.js';
import { computeBreakdown } from '../utils/salaryEngine.js';
import { rupeesToPaisa } from '../utils/money.js';
import { paisaToWords } from '../utils/numberToWords.js';
import { generateToken } from '../utils/tokens.js';
import { generatePayslipPdf, generateOfferLetterPdf, bakeSignatureOnOffer } from '../services/pdfService.js';

/**
 * Comprehensive demo seed — loads every module with coherent initial data:
 * admin + HR + employees, salary templates, frozen assignments, payslips,
 * offers (sent + accepted), and vault documents.
 *
 * Run with: npm run db:seed   (DESTRUCTIVE — wipes the HRMS collections first)
 */

const DEMO_PASSWORD = 'Password1';
const SIGNATURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const addr = (over = {}) => ({ street: '123 Tech Lane', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001', ...over });

const baseContact = () => ({
  personalMobile: '9876543210',
  emergencyContactName: 'Emergency Kin',
  emergencyContactRelation: 'Sibling',
  emergencyContactPhone: '9876500000',
  presentAddress: addr(),
  permanentAddress: addr()
});

const TEMPLATES = [
  {
    name: 'Engineering-V2',
    description: 'Standard engineering compensation structure',
    earningsStructure: [
      { key: 'basic', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 45 },
      { key: 'hra', label: 'HRA', calculationType: 'percentage_of_basic', valueFactor: 50 },
      { key: 'special', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
    ],
    deductionsStructure: [
      { key: 'pf', label: 'Provident Fund', calculationType: 'percentage_of_basic', valueFactor: 12 },
      { key: 'pt', label: 'Professional Tax', calculationType: 'fixed', valueFactor: 20000 }, // ₹200
      { key: 'tds', label: 'TDS', calculationType: 'percentage_of_ctc', valueFactor: 5 }
    ]
  },
  {
    name: 'Sales-Standard',
    description: 'Standard sales compensation structure',
    earningsStructure: [
      { key: 'basic', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 40 },
      { key: 'hra', label: 'HRA', calculationType: 'percentage_of_basic', valueFactor: 40 },
      { key: 'special', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
    ],
    deductionsStructure: [
      { key: 'pf', label: 'Provident Fund', calculationType: 'percentage_of_basic', valueFactor: 12 },
      { key: 'pt', label: 'Professional Tax', calculationType: 'fixed', valueFactor: 20000 }
    ]
  }
];

const wipe = async () => {
  await Promise.all([
    User.deleteMany({}),
    SalaryStructureTemplate.deleteMany({}),
    EmployeeSalaryAssignment.deleteMany({}),
    OfferLetter.deleteMany({}),
    SalarySlip.deleteMany({})
  ]);
};

const createPayslip = async (user, assignment, month, year) => {
  const b = assignment.frozenMonthlyBreakdown;
  const data = {
    employeeId: user._id, month, year,
    metaSnapshot: {
      employeeDisplayId: user.employeeDetails.employeeId,
      fullName: `${user.personalDetails.firstName} ${user.personalDetails.lastName}`,
      designation: user.employeeDetails.designation,
      department: user.employeeDetails.department,
      pan: user.employeeDetails.panNumber,
      uan: user.employeeDetails.uanNumber,
      bankAccountHidden: `****${String(user.employeeDetails.bankDetails.accountNumber).slice(-4)}`
    },
    earningsLedger: b.earnings.map((e) => ({ label: e.label, amount: e.monthlyAmount })),
    deductionsLedger: b.deductions.map((d) => ({ label: d.label, amount: d.monthlyAmount })),
    financialSummary: {
      grossEarnings: b.grossEarnings, totalDeductions: b.totalDeductions,
      netPay: b.netTakeHome, netPayInWords: paisaToWords(b.netTakeHome)
    },
    paymentStatus: 'Paid'
  };
  data.pdfUrl = await generatePayslipPdf(data);
  return SalarySlip.create(data);
};

const run = async () => {
  await connectDB();
  console.log('🧹 Wiping existing HRMS collections...');
  await wipe();

  // --- Templates ---
  const [engTpl, salesTpl] = await SalaryStructureTemplate.create(TEMPLATES);
  console.log(`✅ ${await SalaryStructureTemplate.countDocuments()} salary templates`);

  // --- Admin + HR ---
  const admin = await User.create({
    email: 'admin@xyz.com', password: 'Admin@123', role: 'admin', isActive: true,
    personalDetails: { firstName: 'Admin', lastName: 'System', dateOfBirth: new Date('1988-01-01'), gender: 'Prefer not to say' },
    contactInfo: baseContact()
  });

  const hr = await User.create({
    email: 'priya.hr@xyz.com', password: DEMO_PASSWORD, role: 'hr', isActive: true,
    personalDetails: { firstName: 'Priya', lastName: 'Sharma', dateOfBirth: new Date('1990-06-15'), gender: 'Female' },
    contactInfo: baseContact(),
    employeeDetails: { employeeId: 'EMP45871', designation: 'HR Manager', department: 'HR', dateOfJoining: new Date('2021-04-01') }
  });

  // --- Employees ---
  const employeesSpec = [
    { email: 'rahul.kumar@xyz.com', first: 'Rahul', last: 'Kumar', empId: 'EMP45872', designation: 'Senior Software Engineer', department: 'Engineering', ctc: 1200000, tpl: engTpl, manager: true },
    { email: 'amit.patel@xyz.com', first: 'Amit', last: 'Patel', empId: 'EMP45873', designation: 'Software Engineer', department: 'Engineering', ctc: 900000, tpl: engTpl },
    { email: 'neha.gupta@xyz.com', first: 'Neha', last: 'Gupta', empId: 'EMP45874', designation: 'Account Executive', department: 'Sales', ctc: 800000, tpl: salesTpl },
    { email: 'sunny.deol@xyz.com', first: 'Sunny', last: 'Deol', empId: 'EMP45860', designation: 'Operations Lead', department: 'Operations', ctc: 1500000, tpl: engTpl }
  ];

  const employees = [];
  let managerId = null;
  for (const spec of employeesSpec) {
    const user = await User.create({
      email: spec.email, password: DEMO_PASSWORD, role: 'employee', isActive: true, onboardingStage: 'completed',
      personalDetails: { firstName: spec.first, lastName: spec.last, dateOfBirth: new Date('1993-09-20'), gender: 'Male', maritalStatus: 'Single' },
      contactInfo: baseContact(),
      familyDetails: [{ name: `${spec.first} Sr.`, relationship: 'Father', dependent: true }],
      employeeDetails: {
        employeeId: spec.empId, designation: spec.designation, department: spec.department,
        dateOfJoining: new Date('2022-07-01'), panNumber: 'ABCDE1234F', uanNumber: '100200300400',
        reportingManagerId: managerId,
        bankDetails: { accountHolderName: `${spec.first} ${spec.last}`, accountNumber: '123456789012', bankName: 'HDFC Bank', ifscCode: 'HDFC0001234' }
      }
    });
    if (spec.manager) managerId = user._id;

    const breakdown = computeBreakdown(spec.tpl, rupeesToPaisa(spec.ctc));
    const assignment = await EmployeeSalaryAssignment.create({
      userId: user._id, templateId: spec.tpl._id, annualCTC: rupeesToPaisa(spec.ctc), frozenMonthlyBreakdown: breakdown
    });

    // Payslips for May & June 2026.
    await createPayslip(user, assignment, 5, 2026);
    await createPayslip(user, assignment, 6, 2026);

    employees.push({ user, assignment });
  }

  // --- Vault documents on the first employee ---
  const rahul = employees[0].user;
  rahul.uploadedDocuments.push(
    { documentType: 'PAN', documentNumber: 'ABCDE1234F', fileUrl: 'uploads/documents/seed-pan.pdf', verificationStatus: 'Verified' },
    { documentType: 'Aadhar', documentNumber: '111122223333', fileUrl: 'uploads/documents/seed-aadhar.pdf', verificationStatus: 'Pending' }
  );
  await rahul.save();

  // --- Offers: one sent (live magic link) + one accepted (signed) ---
  const offerSpecs = [
    { email: 'vikram.singh@example.com', name: 'Vikram Singh', position: 'UI/UX Designer', department: 'Design', ctc: 1000000, tpl: engTpl, accept: false },
    { email: 'rajesh.k@example.com', name: 'Rajesh Kumar', position: 'DevOps Specialist', department: 'Engineering', ctc: 1400000, tpl: engTpl, accept: true }
  ];

  const offerLinks = [];
  for (const o of offerSpecs) {
    const cand = await User.create({
      email: o.email, password: generateToken().raw, role: 'employee', isActive: false, onboardingStage: 'personal',
      personalDetails: { firstName: o.name.split(' ')[0], lastName: o.name.split(' ').slice(1).join(' ') || '-', dateOfBirth: new Date('1970-01-01'), gender: 'Prefer not to say' },
      contactInfo: { ...baseContact(), personalMobile: '0000000000', emergencyContactName: 'Pending', emergencyContactRelation: 'Pending', emergencyContactPhone: '0000000000', presentAddress: addr({ street: 'Pending', city: 'Pending', state: 'Pending', zipCode: '000000' }), permanentAddress: addr({ street: 'Pending', city: 'Pending', state: 'Pending', zipCode: '000000' }) }
    });

    const breakdown = computeBreakdown(o.tpl, rupeesToPaisa(o.ctc));
    const assignment = await EmployeeSalaryAssignment.create({ userId: cand._id, templateId: o.tpl._id, annualCTC: rupeesToPaisa(o.ctc), frozenMonthlyBreakdown: breakdown });
    const pdfFileUrl = await generateOfferLetterPdf({ fullName: o.name, position: o.position, department: o.department, offerDate: new Date(), joiningDate: new Date('2026-08-01'), breakdown, annualCTC: rupeesToPaisa(o.ctc) });
    const { raw, hash } = generateToken();

    const offer = await OfferLetter.create({
      candidateEmail: o.email, fullName: o.name, position: o.position, department: o.department,
      offerDate: new Date(), joiningDate: new Date('2026-08-01'), salaryAssignmentId: assignment._id,
      status: o.accept ? 'accepted' : 'sent', pdfFileUrl,
      accessTokenHash: o.accept ? null : hash, accessTokenExpires: o.accept ? null : new Date(Date.now() + 7 * 864e5)
    });

    if (o.accept) {
      const signedAt = new Date();
      offer.signedPdfFileUrl = await bakeSignatureOnOffer(pdfFileUrl, SIGNATURE_PNG, { name: o.name, signedAt });
      offer.digitalSignature = { signatureBase64: SIGNATURE_PNG, signedAt, ipAddress: '127.0.0.1', verificationToken: generateToken().hash };
      await offer.save();
    } else {
      offerLinks.push(`   Magic link for ${o.name}: /offer/${raw}`);
    }
  }

  console.log('\n========================================================');
  console.log('  HRMS DEMO DATA LOADED');
  console.log('========================================================');
  console.log(`  Users:        ${await User.countDocuments()}`);
  console.log(`  Templates:    ${await SalaryStructureTemplate.countDocuments()}`);
  console.log(`  Assignments:  ${await EmployeeSalaryAssignment.countDocuments()}`);
  console.log(`  Payslips:     ${await SalarySlip.countDocuments()}`);
  console.log(`  Offers:       ${await OfferLetter.countDocuments()}`);
  console.log('--------------------------------------------------------');
  console.log('  LOGIN CREDENTIALS');
  console.log(`   Admin:    admin@xyz.com / Admin@123`);
  console.log(`   HR:       priya.hr@xyz.com / ${DEMO_PASSWORD}`);
  console.log(`   Employee: rahul.kumar@xyz.com / ${DEMO_PASSWORD}`);
  if (offerLinks.length) {
    console.log('--------------------------------------------------------');
    console.log('  LIVE CANDIDATE OFFER LINKS (prefix with CLIENT_ORIGIN)');
    offerLinks.forEach((l) => console.log(l));
  }
  console.log('========================================================\n');

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('❌ Seed failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
