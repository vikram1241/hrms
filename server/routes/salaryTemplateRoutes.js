import { Router } from 'express';
import {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deactivateTemplate
} from '../controllers/salaryTemplateController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { createTemplateRules, updateTemplateRules } from '../validators/salaryValidators.js';
import validate from '../middleware/validate.js';

const router = Router();
router.use(verifyToken, authorizeRoles(['admin', 'hr']));

router.post('/', createTemplateRules, validate, createTemplate);
router.get('/', listTemplates);
router.get('/:id', getTemplate);
router.put('/:id', updateTemplateRules, validate, updateTemplate);
router.delete('/:id', deactivateTemplate);

export default router;
