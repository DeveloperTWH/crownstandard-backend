const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/category.controller");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");


router.post("/", auth, requireRole("admin"), categoryController.createCategory);


router.get("/", categoryController.getAllCategories);


router.get("/:id", categoryController.getCategoryById);


router.put("/:id", auth, requireRole("admin"), categoryController.updateCategory);


router.delete("/:id", auth, requireRole("admin"), categoryController.deleteCategory);


router.patch("/:id/toggle", auth, requireRole("admin"), categoryController.toggleCategoryStatus);

module.exports = router;
