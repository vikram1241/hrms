import { Router } from 'express';
import {
  listUsers,
  getUserById,
  updateUser,
  softDeleteUser,
  restoreUser
} from '../controllers/userController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { updateUserRules } from '../validators/userValidators.js';
import validate from '../middleware/validate.js';

const router = Router();

// Directory management is restricted to admin and HR.
router.use(verifyToken, authorizeRoles(['admin', 'hr']));

router.get('/', listUsers);
router.get('/:id', getUserById);
router.put('/:id', updateUserRules, validate, updateUser);
router.delete('/:id', softDeleteUser);
router.post('/:id/restore', restoreUser);

export default router;
