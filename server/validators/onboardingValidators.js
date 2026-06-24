import { body } from 'express-validator';

export const personalRules = [
  body('firstName').optional().isString().trim().notEmpty(),
  body('lastName').optional().isString().trim().notEmpty(),
  body('dateOfBirth').optional().isISO8601().withMessage('dateOfBirth must be a valid date'),
  body('gender').optional().isIn(['Male', 'Female', 'Non-binary', 'Prefer not to say']),
  body('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  body('maritalStatus').optional().isIn(['Single', 'Married', 'Divorced', 'Widowed'])
];

export const familyRules = [
  body('familyDetails').isArray().withMessage('familyDetails must be an array'),
  body('familyDetails.*.name').isString().trim().notEmpty().withMessage('Family member name is required'),
  body('familyDetails.*.relationship').isIn(['Father', 'Mother', 'Spouse', 'Sibling', 'Child', 'Other']).withMessage('Invalid relationship')
];

const addressRules = (prefix) => [
  body(`${prefix}.street`).isString().trim().notEmpty().withMessage('Street is required'),
  body(`${prefix}.city`).isString().trim().notEmpty().withMessage('City is required'),
  body(`${prefix}.state`).isString().trim().notEmpty().withMessage('State is required'),
  body(`${prefix}.zipCode`).isString().trim().notEmpty().withMessage('Zip code is required')
];

export const contactRules = [
  body('personalMobile').isString().trim().matches(/^[0-9+\-\s()]{7,15}$/).withMessage('Valid mobile is required'),
  body('emergencyContactName').isString().trim().notEmpty().withMessage('Emergency contact name is required'),
  body('emergencyContactRelation').isString().trim().notEmpty().withMessage('Emergency contact relation is required'),
  body('emergencyContactPhone').isString().trim().matches(/^[0-9+\-\s()]{7,15}$/).withMessage('Valid emergency phone is required'),
  ...addressRules('presentAddress'),
  body('sameAsPresent').optional().isBoolean().toBoolean()
];

export const bankRules = [
  body('accountHolderName').isString().trim().notEmpty().withMessage('Account holder name is required'),
  body('accountNumber').isString().trim().matches(/^[0-9]{6,20}$/).withMessage('Account number is invalid'),
  body('bankName').isString().trim().notEmpty().withMessage('Bank name is required'),
  body('ifscCode').isString().trim().matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/).withMessage('IFSC code is invalid'),
  body('panNumber').optional().isString().trim().matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/).withMessage('PAN is invalid')
];

export const documentUploadRules = [
  body('documentType').isIn(['Aadhar', 'PAN', 'Passport', 'VoterID', 'DegreeCertificate', 'EducationCertificate', 'RelievingLetter', 'Payslip']).withMessage('Invalid document type'),
  body('documentName').optional().isString().trim(),
  body('documentNumber').isString().trim().notEmpty().withMessage('Document reference number is required')
];

export const verifyDocumentRules = [
  body('status').isIn(['Pending', 'Verified', 'Rejected']).withMessage('Invalid verification status')
];
