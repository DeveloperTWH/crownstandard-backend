const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { getUser, approveProvider, setUserStatus, getAllUsers } = require('../controllers/user.controller');

// Admin-only routes
router.get('/:id', auth, requireRole('admin'), getUser);
router.put('/:id/approve', auth, requireRole('admin'), approveProvider);
router.put('/:id/status', auth, requireRole('admin'), setUserStatus);
router.get('/', auth, requireRole('admin'), getAllUsers);

module.exports = router;
