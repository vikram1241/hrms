import { Router } from 'express';
import { assignSalary, getAssignmentByUser } from '../controllers/salaryAssignmentController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { assignSalaryRules } from '../validators/salaryValidators.js';
import validate from '../middleware/validate.js';

const router = Router();
router.use(verifyToken, authorizeRoles(['admin', 'hr']));

router.post('/', assignSalaryRules, validate, assignSalary);
router.get('/user/:userId', getAssignmentByUser);

export default router;
