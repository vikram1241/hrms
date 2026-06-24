import { body } from 'express-validator';

const DEPARTMENTS = ['Engineering', 'HR', 'Sales', 'Marketing', 'Finance', 'Operations', 'Design'];

export const updateUserRules = [
  body('firstName').optional().isString().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().isString().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().isString().trim().matches(/^[0-9+\-\s()]{7,15}$/).withMessage('Phone number is invalid'),
  body('role').optional().isIn(['admin', 'hr', 'employee']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean').toBoolean(),
  body('designation').optional().isString().trim(),
  body('department').optional().isIn(DEPARTMENTS).withMessage('Invalid department'),
  body('employeeId').optional().isString().trim().notEmpty().withMessage('Employee ID cannot be empty')
];
