import { Router } from 'express';
import {
  createSection, listSections, uploadMedia, listMedia, streamMedia, setProgress, listMyProgress
} from '../controllers/trainingController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadVideo } from '../middleware/uploadVideo.js';

const router = Router();
router.use(verifyToken);

const manage = requirePermission(PERMISSIONS.TRAINING_MANAGE);

// Browse (any authenticated user)
router.get('/sections', listSections);
router.get('/media', listMedia);
router.get('/media/:id/stream', streamMedia);
router.get('/progress/mine', listMyProgress);
router.post('/media/:id/progress', setProgress);

// Manage (HR)
router.post('/sections', manage, createSection);
router.post('/media', manage, uploadVideo, uploadMedia);

export default router;
