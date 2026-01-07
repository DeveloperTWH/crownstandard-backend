const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const adminCtrl = require('../controllers/admin.controller');

// Dashboard APIs
router.get('/dashboard/stats', auth, requireRole('admin'), adminCtrl.getDashboardStats);
router.get('/dashboard/analytics', auth, requireRole('admin'), adminCtrl.getMonthlyAnalytics);
router.get('/dashboard/activities', auth, requireRole('admin'), adminCtrl.getRecentActivities);
router.get('/dashboard/health', auth, requireRole('admin'), adminCtrl.getSystemHealth);

module.exports = router;
