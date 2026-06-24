import { Router } from 'express';
import {
  createOffer,
  bulkCreateOffers,
  listOffers,
  getOffer,
  updateOfferStatus,
  downloadOfferPdf,
  resendOffer,
  getMyOffer,
  downloadMyOfferPdf
} from '../controllers/offerController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { uploadXlsx } from '../middleware/uploadXlsx.js';
import { createOfferRules, offerStatusRules } from '../validators/offerValidators.js';
import validate from '../middleware/validate.js';

const router = Router();

// All offer routes require authentication.
router.use(verifyToken);

// Employee self-service — own offer only. Declared before the admin gate and
// before the '/:id' routes so the literal '/mine' path matches first.
router.get('/mine', getMyOffer);
router.get('/mine/pdf', downloadMyOfferPdf);

// Everything below is admin/HR only. (Candidate-facing offer access is
// unauthenticated via magic link — see candidateRoutes.)
router.use(authorizeRoles(['admin', 'hr']));

router.post('/', createOfferRules, validate, createOffer);
router.post('/bulk', uploadXlsx, bulkCreateOffers);
router.get('/', listOffers);
router.get('/:id', getOffer);
router.get('/:id/pdf', downloadOfferPdf);
router.patch('/:id/status', offerStatusRules, validate, updateOfferStatus);
router.post('/:id/resend', resendOffer);

export default router;
