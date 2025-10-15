const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const serviceCtrl = require("../controllers/service.controller");

router.post("/", auth, requireRole("provider"), serviceCtrl.createService);
router.put("/:id", auth, requireRole("provider"), serviceCtrl.updateService);
router.delete("/:id", auth, requireRole("provider"), serviceCtrl.deleteService);
router.get("/my", auth, requireRole("provider"), serviceCtrl.getMyServices);

module.exports = router;
