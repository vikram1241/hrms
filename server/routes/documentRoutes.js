import { Router } from 'express';
import {
  uploadUserDocument,
  listMyDocuments,
  listUserDocuments,
  streamDocument,
  verifyDocument,
  deleteDocument
} from '../controllers/documentController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { uploadDocument } from '../middleware/uploadDocument.js';
import { documentUploadRules, verifyDocumentRules } from '../validators/onboardingValidators.js';
import validate from '../middleware/validate.js';

const router = Router();
router.use(verifyToken);

// Self-service vault.
// Multer runs first so multipart body fields are available to the validators.
router.post('/', uploadDocument, documentUploadRules, validate, uploadUserDocument);
router.get('/', listMyDocuments);

// Authorized stream (ownership/role enforced in the controller).
router.get('/file/:fileId', streamDocument);
router.delete('/file/:fileId', deleteDocument);

// HR / admin review.
router.get('/user/:userId', authorizeRoles(['admin', 'hr']), listUserDocuments);
router.patch('/file/:fileId/verify', authorizeRoles(['admin', 'hr']), verifyDocumentRules, validate, verifyDocument);

export default router;
