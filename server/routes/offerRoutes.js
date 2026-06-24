import { Router } from 'express';
import {
  createOffer,
  bulkCreateOffers,
  listOffers,
  getOffer,
  updateOfferStatus,
  downloadOfferPdf,
  resendOffer
} from '../controllers/offerController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { uploadXlsx } from '../middleware/uploadXlsx.js';
import { createOfferRules, offerStatusRules } from '../validators/offerValidators.js';
import validate from '../middleware/validate.js';

const router = Router();

// All offer-management routes are admin/HR only. (Candidate-facing offer
// access is unauthenticated via magic link — see candidateRoutes.)
router.use(verifyToken, authorizeRoles(['admin', 'hr']));

router.post('/', createOfferRules, validate, createOffer);
router.post('/bulk', uploadXlsx, bulkCreateOffers);
router.get('/', listOffers);
router.get('/:id', getOffer);
router.get('/:id/pdf', downloadOfferPdf);
router.patch('/:id/status', offerStatusRules, validate, updateOfferStatus);
router.post('/:id/resend', resendOffer);

export default router;
