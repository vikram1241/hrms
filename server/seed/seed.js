import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Company, { PLATFORM_SLUG } from '../models/Company.js';
import User from '../models/User.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import OfferLetter from '../models/OfferLetter.js';
import SalarySlip from '../models/SalarySlip.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Holiday from '../models/Holiday.js';
import PerformanceReview from '../models/PerformanceReview.js';
import { Incentive, Appraisal, TrainingRecord } from '../models/performanceExtras.js';
import Asset from '../models/Asset.js';
import EmployeeDocument from '../models/EmployeeDocument.js';
import DocumentType from '../models/DocumentType.js';
import EmployeeDocumentRecord from '../models/EmployeeDocumentRecord.js';
import { TrainingSection, TrainingMedia } from '../models/trainingLibrary.js';
import ExitRecord from '../models/ExitRecord.js';
import { computeBreakdown } from '../utils/salaryEngine.js';
import { rupeesToPaisa } from '../utils/money.js';
import { paisaToWords } from '../utils/numberToWords.js';
import { generateToken } from '../utils/tokens.js';
import { runWithStore } from '../utils/tenantContext.js';
import { generatePayslipPdf, generateOfferLetterPdf, bakeSignatureOnOffer, generateCompanyDocPdf } from '../services/pdfService.js';

/**
 * Comprehensive multi-tenant demo seed — loads EVERY module with coherent data
 * for one demo company: admin + HR + employees (with education/experience),
 * salary templates, frozen assignments, payslips, offers, attendance, leave,
 * holidays, performance reviews/incentives/appraisals/training, assets,
 * generated + uploadable documents, a training library, and an exit record.
 *
 * Run with: npm run db:seed   (DESTRUCTIVE — drops the whole database first)
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
const dateKey = (d) => new Date(d).toISOString().slice(0, 10);

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
      { key: 'pt', label: 'Professional Tax', calculationType: 'fixed', valueFactor: 20000 },
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
  console.log('🧹 Dropping database...');
  await mongoose.connection.dropDatabase();

  // --- Platform tenant + superadmin (not scoped) ---
  const platform = await Company.create({ slug: PLATFORM_SLUG, name: 'Platform', status: 'active' });
  await User.create({
    companyId: platform._id, email: 'super@platform.local', password: 'ChangeMe!123', role: 'superadmin', isActive: true,
    onboardingStage: 'completed',
    personalDetails: { firstName: 'Platform', lastName: 'Admin', dateOfBirth: new Date('1985-01-01'), gender: 'Prefer not to say' },
    contactInfo: baseContact()
  });

  // --- Demo company with statutory config + branding ---
  const company = await Company.create({
    slug: 'xyz', name: 'Mirus Med Sciences', status: 'active', contactEmail: 'hr@xyz.com',
    branding: { authorizedSignatoryName: 'Priya Sharma', authorizedSignatoryDesignation: 'HR Manager' },
    statutory: { pfNumber: 'PF-KA-1234567', esiNumber: 'ESI-77-999', ptNumber: 'PT-KA-555', tan: 'BLRX01234C', gstin: '29ABCDE1234F1Z5' },
    address: addr()
  });

  // Everything below runs inside the demo company's tenant context so companyId
  // is stamped automatically by the tenantScope plugin.
  const summary = await runWithStore({ companyId: String(company._id), role: 'admin', authed: true }, () => seedCompany(company));

  console.log('\n========================================================');
  console.log('  HRMS MULTI-TENANT DEMO DATA LOADED');
  console.log('========================================================');
  Object.entries(summary).filter(([k]) => !k.startsWith('_')).forEach(([k, v]) => console.log(`  ${k.padEnd(14)}${v}`));
  console.log('--------------------------------------------------------');
  console.log('  LOGIN (company code / email / password)');
  console.log('   Company code (slug):  xyz');
  console.log('   Admin:      xyz / admin@xyz.com / Admin@123');
  console.log(`   HR:         xyz / priya.hr@xyz.com / ${DEMO_PASSWORD}`);
  console.log(`   Employee:   xyz / rahul.kumar@xyz.com / ${DEMO_PASSWORD}`);
  console.log('   Superadmin: _platform / super@platform.local / ChangeMe!123');
  if (summary._offerLink) {
    console.log('--------------------------------------------------------');
    console.log(`  LIVE OFFER LINK: /offer/${summary._offerLink}`);
  }
  console.log('========================================================\n');

  await mongoose.disconnect();
  process.exit(0);
};

async function seedCompany(company) {
  // --- Templates ---
  const [engTpl, salesTpl] = await SalaryStructureTemplate.create(TEMPLATES);

  // --- Admin + HR ---
  await User.create({
    email: 'admin@xyz.com', password: 'Admin@123', role: 'admin', isActive: true, onboardingStage: 'completed',
    personalDetails: { firstName: 'Admin', lastName: 'System', dateOfBirth: new Date('1988-01-01'), gender: 'Prefer not to say' },
    contactInfo: baseContact()
  });
  await User.create({
    email: 'priya.hr@xyz.com', password: DEMO_PASSWORD, role: 'hr', isActive: true, onboardingStage: 'completed',
    personalDetails: { firstName: 'Priya', lastName: 'Sharma', dateOfBirth: new Date('1990-06-15'), gender: 'Female' },
    contactInfo: baseContact(),
    employeeDetails: { employeeId: 'EMP45871', designation: 'HR Manager', department: 'HR', dateOfJoining: new Date('2021-04-01') }
  });

  // --- Employees ---
  const employeesSpec = [
    { email: 'rahul.kumar@xyz.com', first: 'Rahul', last: 'Kumar', empId: 'EMP45872', designation: 'Senior Software Engineer', department: 'Engineering', ctc: 1200000, tpl: engTpl, type: 'Permanent', manager: true },
    { email: 'amit.patel@xyz.com', first: 'Amit', last: 'Patel', empId: 'EMP45873', designation: 'Software Engineer', department: 'Engineering', ctc: 900000, tpl: engTpl, type: 'Probation' },
    { email: 'neha.gupta@xyz.com', first: 'Neha', last: 'Gupta', empId: 'EMP45874', designation: 'Account Executive', department: 'Sales', ctc: 800000, tpl: salesTpl, type: 'Permanent' },
    { email: 'sunny.deol@xyz.com', first: 'Sunny', last: 'Deol', empId: 'EMP45860', designation: 'Operations Lead', department: 'Operations', ctc: 1500000, tpl: engTpl, type: 'Contract', exiting: true }
  ];

  const employees = [];
  let managerId = null;
  for (const spec of employeesSpec) {
    const user = await User.create({
      email: spec.email, password: DEMO_PASSWORD, role: 'employee', isActive: true, onboardingStage: 'completed',
      personalDetails: { firstName: spec.first, lastName: spec.last, dateOfBirth: new Date('1993-09-20'), gender: 'Male', maritalStatus: 'Single', passportPhotoUrl: null },
      contactInfo: baseContact(),
      familyDetails: [{ name: `${spec.first} Sr.`, relationship: 'Father', dependent: true }],
      educationHistory: [
        { level: 'HSC', institution: 'City Junior College', boardOrUniversity: 'State Board', yearOfPassing: 2010, gradeOrPercentage: '88%' },
        { level: 'Graduate', institution: 'National Institute of Technology', boardOrUniversity: 'NIT', yearOfPassing: 2014, gradeOrPercentage: '8.2 CGPA' }
      ],
      experienceHistory: [
        { employerName: 'Prior Tech Pvt Ltd', designation: 'Engineer', fromDate: new Date('2015-06-01'), toDate: new Date('2022-06-30'), lastDrawnCTC: rupeesToPaisa(900000), reasonForLeaving: 'Career growth' }
      ],
      references: [{ name: 'Former Manager', relationship: 'Manager', company: 'Prior Tech', phone: '9800000000' }],
      employeeDetails: {
        employeeId: spec.empId, designation: spec.designation, department: spec.department,
        employmentType: spec.type, workLocation: 'Hyderabad HQ',
        dateOfJoining: new Date('2022-07-01'), panNumber: 'ABCDE1234F', uanNumber: '100200300400',
        esiNumber: 'ESI-EMP-001', professionalTaxNumber: 'PT-EMP-001',
        reportingManagerId: managerId,
        bankDetails: { accountHolderName: `${spec.first} ${spec.last}`, accountNumber: '123456789012', bankName: 'HDFC Bank', ifscCode: 'HDFC0001234', upiId: `${spec.first.toLowerCase()}@hdfc` }
      }
    });
    if (spec.manager) managerId = user._id;

    const breakdown = computeBreakdown(spec.tpl, rupeesToPaisa(spec.ctc));
    const assignment = await EmployeeSalaryAssignment.create({ userId: user._id, templateId: spec.tpl._id, annualCTC: rupeesToPaisa(spec.ctc), frozenMonthlyBreakdown: breakdown });
    await createPayslip(user, assignment, 5, 2026);
    await createPayslip(user, assignment, 6, 2026);

    employees.push({ user, assignment, spec });
  }

  await seedModules(company, employees);

  // --- Offers: one sent (live link) + one accepted ---
  const link = await seedOffers(engTpl);

  return {
    Users: await User.countDocuments(),
    Templates: await SalaryStructureTemplate.countDocuments(),
    Assignments: await EmployeeSalaryAssignment.countDocuments(),
    Payslips: await SalarySlip.countDocuments(),
    Offers: await OfferLetter.countDocuments(),
    Attendance: await Attendance.countDocuments(),
    Leaves: await LeaveRequest.countDocuments(),
    Holidays: await Holiday.countDocuments(),
    Reviews: await PerformanceReview.countDocuments(),
    Assets: await Asset.countDocuments(),
    'Docs (issued)': await EmployeeDocument.countDocuments(),
    'Doc types': await DocumentType.countDocuments(),
    'Training sec.': await TrainingSection.countDocuments(),
    Exits: await ExitRecord.countDocuments(),
    _offerLink: link
  };
}

async function seedModules(company, employees) {
  const rahul = employees[0].user;

  // Vault documents on the first employee.
  rahul.uploadedDocuments.push(
    { documentType: 'PAN', documentNumber: 'ABCDE1234F', fileUrl: 'uploads/documents/seed-pan.pdf', verificationStatus: 'Verified' },
    { documentType: 'Aadhar', documentNumber: '111122223333', fileUrl: 'uploads/documents/seed-aadhar.pdf', verificationStatus: 'Pending' },
    { documentType: 'DrivingLicence', documentNumber: 'KA0120200001', fileUrl: 'uploads/documents/seed-dl.pdf', verificationStatus: 'Verified' }
  );
  await rahul.save();

  // Attendance — last 10 days for each employee (one Absent for variety).
  for (const { user } of employees) {
    for (let i = 1; i <= 10; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      await Attendance.create({ userId: user._id, date: d, dateKey: dateKey(d), status: i === 3 ? 'Absent' : 'Present', checkIn: '09:30', checkOut: '18:30' });
    }
  }

  // Leave — one pending, one approved.
  await LeaveRequest.create({ userId: rahul._id, type: 'Casual', fromDate: new Date('2026-07-20'), toDate: new Date('2026-07-21'), days: 2, reason: 'Personal work', status: 'Pending' });
  await LeaveRequest.create({ userId: employees[1].user._id, type: 'Sick', fromDate: new Date('2026-06-10'), toDate: new Date('2026-06-11'), days: 2, reason: 'Fever', status: 'Approved', decidedAt: new Date() });

  // Holidays.
  await Holiday.create({ date: new Date('2026-08-15'), dateKey: '2026-08-15', name: 'Independence Day' });
  await Holiday.create({ date: new Date('2026-10-02'), dateKey: '2026-10-02', name: 'Gandhi Jayanti' });

  // Performance: review + incentive + appraisal + training record for Rahul.
  await PerformanceReview.create({
    userId: rahul._id, period: 'Q1-2026', overallRating: 4, status: 'Published', comments: 'Strong quarter, exceeded delivery targets.',
    kpis: [{ title: 'On-time delivery', target: '95%', achieved: '98%', weightage: 40, score: 5 }, { title: 'Code quality', target: 'A', achieved: 'A', weightage: 30, score: 4 }]
  });
  await Incentive.create({ userId: rahul._id, period: 'Q1-2026', amount: rupeesToPaisa(25000), reason: 'Delivery bonus', status: 'Approved' });
  await Appraisal.create({ userId: rahul._id, effectiveDate: new Date('2026-04-01'), previousDesignation: 'Software Engineer', newDesignation: 'Senior Software Engineer', previousCTC: rupeesToPaisa(1000000), newCTC: rupeesToPaisa(1200000), remarks: 'Promotion on merit' });
  await TrainingRecord.create({ userId: rahul._id, title: 'Advanced React', provider: 'Internal L&D', completedAt: new Date('2026-05-15'), status: 'Completed' });

  // Assets — assign a laptop + mobile; one spare available.
  await Asset.create({ tag: 'LAP-001', type: 'Laptop', description: 'Dell Latitude 7420', serialNumber: 'DL7420-001', status: 'Assigned', assignedTo: rahul._id, issuedAt: new Date('2022-07-01') });
  await Asset.create({ tag: 'MOB-014', type: 'Mobile', description: 'iPhone SE', status: 'Assigned', assignedTo: employees[2].user._id, issuedAt: new Date('2023-01-10') });
  await Asset.create({ tag: 'LAP-002', type: 'Laptop', description: 'MacBook Air M2', status: 'Available' });

  // Generated + sealed document (acknowledged handbook) for Rahul.
  const pdfUrl = await generateCompanyDocPdf({
    title: 'Employee Handbook Acknowledgment', company,
    employeeName: 'Rahul Kumar', designation: 'Senior Software Engineer', effectiveDate: new Date('2022-07-01'),
    paragraphs: ['I acknowledge that I have received and read the employee handbook of Mirus Med Sciences.', 'I agree to comply with the company policies.']
  });
  await EmployeeDocument.create({ userId: rahul._id, type: 'Handbook', title: 'Employee Handbook Acknowledgment', pdfFileUrl: pdfUrl, requiresSignature: false, status: 'acknowledged', acknowledgedAt: new Date() });

  // Uploadable document type (Form 16, read) + a pending record for Rahul.
  const form16 = await DocumentType.create({ name: 'Form 16', section: 'Tax', kind: 'read', termsText: 'Please confirm you have received your Form 16.' });
  await DocumentType.create({ name: 'Investment Declaration', section: 'Tax', kind: 'write', fields: [{ key: 'section80C', label: '80C investments (₹)', type: 'number', required: true }, { key: 'hraClaim', label: 'HRA claim (₹)', type: 'number' }] });
  await EmployeeDocumentRecord.create({ userId: rahul._id, documentTypeId: form16._id, section: 'Tax', accessMode: 'read', sourceFileUrl: 'uploads/documents/seed-form16.pdf', status: 'pending' });

  // Training library — sections (videos uploaded later by HR).
  await TrainingSection.create({ title: 'Onboarding', description: 'New-joiner orientation', order: 1 });
  await TrainingSection.create({ title: 'Compliance', description: 'POSH & security awareness', order: 2 });

  // Exit record for the departing employee.
  const exiting = employees.find((e) => e.spec.exiting);
  if (exiting) {
    await ExitRecord.create({
      userId: exiting.user._id, resignationDate: new Date('2026-06-15'), lastWorkingDay: new Date('2026-07-15'),
      reason: 'Relocation', status: 'InProgress',
      exitInterview: { conductedAt: new Date('2026-07-10'), notes: 'Positive experience overall.' },
      fnfSettlement: { amount: rupeesToPaisa(75000), status: 'Pending' },
      assetReturnChecklist: [{ description: 'Laptop', returned: false }]
    });
  }
}

async function seedOffers(engTpl) {
  let liveLink = null;
  const offerSpecs = [
    { email: 'vikram.singh@example.com', name: 'Vikram Singh', position: 'UI/UX Designer', department: 'Design', ctc: 1000000, accept: false },
    { email: 'rajesh.k@example.com', name: 'Rajesh Kumar', position: 'DevOps Specialist', department: 'Engineering', ctc: 1400000, accept: true }
  ];
  for (const o of offerSpecs) {
    const cand = await User.create({
      email: o.email, password: generateToken().raw, role: 'employee', isActive: false, onboardingStage: 'personal',
      personalDetails: { firstName: o.name.split(' ')[0], lastName: o.name.split(' ').slice(1).join(' ') || '-', dateOfBirth: new Date('1970-01-01'), gender: 'Prefer not to say' },
      contactInfo: { ...baseContact(), personalMobile: '0000000000', emergencyContactName: 'Pending', emergencyContactRelation: 'Pending', emergencyContactPhone: '0000000000', presentAddress: addr({ street: 'Pending', city: 'Pending', state: 'Pending', zipCode: '000000' }), permanentAddress: addr({ street: 'Pending', city: 'Pending', state: 'Pending', zipCode: '000000' }) }
    });
    const breakdown = computeBreakdown(engTpl, rupeesToPaisa(o.ctc));
    const assignment = await EmployeeSalaryAssignment.create({ userId: cand._id, templateId: engTpl._id, annualCTC: rupeesToPaisa(o.ctc), frozenMonthlyBreakdown: breakdown });
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
      offer.acceptedAt = signedAt;
      await offer.save();
    } else {
      liveLink = raw;
    }
  }
  return liveLink;
}

run().catch(async (err) => {
  console.error('❌ Seed failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
