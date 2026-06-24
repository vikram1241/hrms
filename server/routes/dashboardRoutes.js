import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = Router();
router.use(verifyToken, authorizeRoles(['admin', 'hr']));

router.get('/stats', getDashboardStats);

export default router;
