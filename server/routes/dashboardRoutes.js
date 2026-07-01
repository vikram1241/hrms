import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken);

router.get('/stats', requirePermission(PERMISSIONS.DASHBOARD_READ), getDashboardStats);

export default router;
