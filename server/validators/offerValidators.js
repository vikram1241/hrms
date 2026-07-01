import { body } from 'express-validator';

const DEPARTMENTS = ['Engineering', 'HR', 'Sales', 'Marketing', 'Finance', 'Operations', 'Design'];

export const createOfferRules = [
  body('candidateEmail').isEmail().withMessage('Valid candidate email is required').normalizeEmail({ gmail_remove_dots: false }),
  body('fullName').isString().trim().notEmpty().withMessage('Full name is required'),
  body('position').isString().trim().notEmpty().withMessage('Position is required'),
  body('department').isIn(DEPARTMENTS).withMessage('Invalid department'),
  body('joiningDate').isISO8601().withMessage('joiningDate must be a valid date'),
  body('offerDate').optional().isISO8601().withMessage('offerDate must be a valid date'),
  body('templateId').isMongoId().withMessage('Valid templateId is required'),
  body('annualCTC').isFloat({ gt: 0 }).withMessage('annualCTC must be a positive number (rupees)')
];

export const offerStatusRules = [
  body('status').isIn(['sent', 'pending', 'signed', 'accepted', 'declined']).withMessage('Invalid status')
];
