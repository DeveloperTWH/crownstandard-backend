const express = require("express");
const router = express.Router();
const svcPublic = require("../controllers/service.public.controller");

// Public browse + filters + pagination
router.get("/", svcPublic.listServices);

// Public service detail (by id or slug)
router.get("/:id", svcPublic.getServiceDetail);

// Related services (same category)
router.get("/:id/related", svcPublic.getRelatedServices);

module.exports = router;
