import mongoose from 'mongoose';

const OfferLetterSchema = new mongoose.Schema({
  candidateEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  fullName: { type: String, required: true, trim: true },
  position: { type: String, required: true, trim: true },
  department: { type: String, required: true },
  offerDate: { type: Date, required: true, default: Date.now },
  joiningDate: { type: Date, required: true },
  salaryAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeSalaryAssignment', required: true },
  status: { type: String, enum: ['sent', 'pending', 'accepted', 'declined'], default: 'sent', index: true },
  acceptedAt: { type: Date, default: null },

  pdfFileUrl: { type: String, required: true },
  signedPdfFileUrl: { type: String, default: null },

  digitalSignature: {
    signatureBase64: { type: String, default: null },
    signedAt: { type: Date, default: null },
    ipAddress: { type: String, default: null },
    verificationToken: { type: String, default: null }
  },

  // --- Extensions for Epic 5 (candidate magic-link access) ---
  // Hashed, single-use token allowing a candidate to open their offer portal
  // without a password (US 5.1). Stored hashed; raw token is emailed.
  accessTokenHash: { type: String, default: null, index: true },
  accessTokenExpires: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('OfferLetter', OfferLetterSchema);
