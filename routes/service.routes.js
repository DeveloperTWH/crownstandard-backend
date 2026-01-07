const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const serviceCtrl = require("../controllers/service.controller");

router.post("/", auth, requireRole("provider"), serviceCtrl.createService);
router.put("/:id", auth, requireRole("provider"), serviceCtrl.updateService);
router.delete("/:id", auth, requireRole("provider"), serviceCtrl.deleteService);
router.get("/my", auth, requireRole("provider"), serviceCtrl.getMyServices);

// Add these admin routes to service.routes.js
router.get('/admin/all', auth, requireRole('admin'), serviceCtrl.getAllServices);
router.patch('/admin/:id/toggle-visibility', auth, requireRole('admin'), serviceCtrl.toggleServiceVisibility);
router.delete('/admin/:id', auth, requireRole('admin'), serviceCtrl.adminDeleteService);
// Admin service management routes
router.get('/admin/all', auth, requireRole('admin'), serviceCtrl.getAllServices);
router.get('/admin/stats', auth, requireRole('admin'), serviceCtrl.getServiceStats);
router.patch('/admin/:id/approve', auth, requireRole('admin'), serviceCtrl.approveService);
router.patch('/admin/:id/pricing', auth, requireRole('admin'), serviceCtrl.updateServicePricing);
router.patch('/admin/:id/feature', auth, requireRole('admin'), serviceCtrl.featureService);
router.patch('/admin/:id/toggle-visibility', auth, requireRole('admin'), serviceCtrl.toggleServiceVisibility);
router.patch('/admin/bulk-update', auth, requireRole('admin'), serviceCtrl.bulkUpdateServices);
router.delete('/admin/:id', auth, requireRole('admin'), serviceCtrl.adminDeleteService);



module.exports = router;
