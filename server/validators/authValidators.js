import { body } from 'express-validator';

export const loginRules = [
  body('email')
    .isEmail().withMessage('A valid email is required')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('password')
    .isString().withMessage('Password is required')
    .notEmpty().withMessage('Password is required')
];
