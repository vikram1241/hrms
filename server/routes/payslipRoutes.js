import { Router } from 'express';
import {
  generatePayslips,
  listPayslips,
  listMyPayslips,
  downloadPayslipPdf
} from '../controllers/payslipController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { generatePayslipRules } from '../validators/salaryValidators.js';
import validate from '../middleware/validate.js';

const router = Router();
router.use(verifyToken);

// Employee self-service (US 7.2 / 7.3) — own slips only.
router.get('/mine', listMyPayslips);

// Authorized download — ownership/role enforced inside the controller.
router.get('/:id/pdf', downloadPayslipPdf);

// Admin / HR management.
router.post('/generate', authorizeRoles(['admin', 'hr']), generatePayslipRules, validate, generatePayslips);
router.get('/', authorizeRoles(['admin', 'hr']), listPayslips);

export default router;
