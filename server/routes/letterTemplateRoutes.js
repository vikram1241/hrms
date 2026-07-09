import { Router } from 'express';
import {
  listLetterTemplates, createLetterTemplate, updateLetterTemplate, deleteLetterTemplate
} from '../controllers/letterTemplateController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
// Letter template setup reuses the template-management permission.
router.use(verifyToken, requirePermission(PERMISSIONS.TEMPLATE_MANAGE));

router.get('/', listLetterTemplates);
router.post('/', createLetterTemplate);
router.put('/:id', updateLetterTemplate);
router.delete('/:id', deleteLetterTemplate);

export default router;
