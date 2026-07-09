import { Router } from 'express';
import {
  markMyAttendance, listMyAttendance, markAttendance, markBulkAttendance, bulkUploadAttendance, listAttendance,
  applyLeave, listMyLeaves, listLeaves, decideLeave, cancelLeave,
  createHoliday, listHolidays, deleteHoliday
} from '../controllers/attendanceController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadXlsx } from '../middleware/uploadXlsx.js';

// Mounted at /api (so paths read /attendance, /leaves, /holidays).
const router = Router();
router.use(verifyToken);

// Attendance
router.post('/attendance/mark', markMyAttendance);
router.get('/attendance/mine', listMyAttendance);
router.post('/attendance', requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), markAttendance);
router.post('/attendance/bulk', requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), markBulkAttendance);
router.post('/attendance/bulk-upload', requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), uploadXlsx, bulkUploadAttendance);
router.get('/attendance', requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), listAttendance);

// Leave
router.post('/leaves', applyLeave);
router.get('/leaves/mine', listMyLeaves);
router.patch('/leaves/:id/cancel', cancelLeave);
router.get('/leaves', requirePermission(PERMISSIONS.LEAVE_APPROVE), listLeaves);
router.patch('/leaves/:id/decision', requirePermission(PERMISSIONS.LEAVE_APPROVE), decideLeave);

// Holidays
router.get('/holidays', listHolidays); // any authenticated user
router.post('/holidays', requirePermission(PERMISSIONS.HOLIDAY_MANAGE), createHoliday);
router.delete('/holidays/:id', requirePermission(PERMISSIONS.HOLIDAY_MANAGE), deleteHoliday);

export default router;
