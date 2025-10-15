const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const providerCtrl = require("../controllers/provider.controller");

// ✅ Provider readiness check
router.get("/check-readiness", auth, requireRole("provider"), providerCtrl.checkReadiness);

module.exports = router;
