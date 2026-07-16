import { Router } from 'express';
import {
  createReview, updateReview, listReviews, listMyReviews,
  createIncentive, listIncentives, listMyIncentives, streamIncentiveAttachment,
  createAppraisal, listAppraisals, listMyAppraisals, streamAppraisalAttachment,
  createTrainingRecord, listTrainingRecords, listMyTrainingRecords
} from '../controllers/performanceController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { uploadDocument } from '../middleware/uploadDocument.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken);

const manage = requirePermission(PERMISSIONS.PERFORMANCE_MANAGE);

// Employee self-service
router.get('/reviews/mine', listMyReviews);
router.get('/incentives/mine', listMyIncentives);
router.get('/appraisals/mine', listMyAppraisals);
router.get('/training-records/mine', listMyTrainingRecords);

// Reviews
router.post('/reviews', manage, createReview);
router.put('/reviews/:id', manage, updateReview);
router.get('/reviews', manage, listReviews);

// Incentives
router.post('/incentives', manage, uploadDocument, createIncentive);
router.get('/incentives', manage, listIncentives);
router.get('/incentives/:id/attachment', streamIncentiveAttachment);

// Appraisals / promotions
router.post('/appraisals', manage, uploadDocument, createAppraisal);
router.get('/appraisals', manage, listAppraisals);
router.get('/appraisals/:id/attachment', streamAppraisalAttachment);

// Training records
router.post('/training-records', manage, createTrainingRecord);
router.get('/training-records', manage, listTrainingRecords);

export default router;
