import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

const AddressSchema = new mongoose.Schema({
  street: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  country: { type: String, required: true, default: 'India', trim: true },
  zipCode: { type: String, required: true, trim: true }
}, { _id: false });

const FamilyMemberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  relationship: { type: String, required: true, enum: ['Father', 'Mother', 'Spouse', 'Sibling', 'Child', 'Other'] },
  dateOfBirth: { type: Date },
  dependent: { type: Boolean, default: false },
  contactNumber: { type: String, trim: true }
}, { _id: false });

const DocumentReferenceSchema = new mongoose.Schema({
  documentType: { type: String, required: true, enum: ['Aadhar', 'PAN', 'Passport', 'VoterID', 'DegreeCertificate', 'RelievingLetter', 'Payslip'] },
  documentNumber: { type: String, required: true, trim: true },
  fileUrl: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'hr', 'employee'], default: 'employee' },
  isActive: { type: Boolean, default: false, index: true },
  lastLogin: { type: Date },

  // --- Extensions ---
  // Soft-delete marker (US 2.3). Non-null => excluded from directory listings.
  // Kept distinct from `isActive` so "deactivated" and "deleted" stay separate.
  deletedAt: { type: Date, default: null, index: true },

  // Onboarding progress tracker (Epic 6). Highest completed wizard stage.
  onboardingStage: { type: String, enum: ['personal', 'family', 'contact', 'bank', 'completed'], default: 'personal' },

  // Hashed, single-use credential-setup token issued after offer acceptance
  // (US 5.4). Raw token is emailed; only the hash is persisted.
  passwordSetup: {
    tokenHash: { type: String, default: null },
    expiresAt: { type: Date, default: null }
  },

  personalDetails: {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Non-binary', 'Prefer not to say'], required: true },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'], default: 'Single' },
    profilePictureUrl: { type: String, default: null }
  },

  contactInfo: {
    personalMobile: { type: String, required: true, trim: true },
    workMobile: { type: String, trim: true },
    emergencyContactName: { type: String, required: true, trim: true },
    emergencyContactRelation: { type: String, required: true, trim: true },
    emergencyContactPhone: { type: String, required: true, trim: true },
    presentAddress: { type: AddressSchema, required: true },
    permanentAddress: { type: AddressSchema, required: true }
  },

  familyDetails: [FamilyMemberSchema],

  employeeDetails: {
    employeeId: { type: String, unique: true, sparse: true, uppercase: true, trim: true, index: true },
    designation: { type: String, trim: true },
    department: { type: String, enum: ['Engineering', 'HR', 'Sales', 'Marketing', 'Finance', 'Operations', 'Design'] },
    dateOfJoining: { type: Date },
    employmentType: { type: String, enum: ['Full-Time', 'Part-Time', 'Contract', 'Intern'], default: 'Full-Time' },
    reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    panNumber: { type: String, uppercase: true, trim: true },
    uanNumber: { type: String, trim: true },
    bankDetails: {
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      bankName: { type: String, trim: true },
      ifscCode: { type: String, uppercase: true, trim: true }
    }
  },

  uploadedDocuments: [DocumentReferenceSchema]
}, { timestamps: true });

UserSchema.index({ 'personalDetails.firstName': 'text', 'personalDetails.lastName': 'text', 'employeeDetails.employeeId': 'text' });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcryptjs.genSalt(12);
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcryptjs.compare(candidatePassword, this.password);
};

export default mongoose.model('User', UserSchema);
