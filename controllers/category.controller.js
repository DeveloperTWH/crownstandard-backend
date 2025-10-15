const mongoose =require("mongoose")
const ServiceCategory = require("../models/ServiceCategory");

// 🆕 Create Category
exports.createCategory = async (req, res) => {
  try {
    const { name, slug, description } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ success: false, message: "Name and slug are required" });
    }

    const exists = await ServiceCategory.findOne({ $or: [{ name }, { slug }] });
    if (exists) {
      return res.status(409).json({ success: false, message: "Category with same name or slug already exists" });
    }

    const category = await ServiceCategory.create({ name, slug, description });
    res.status(201).json({ success: true, data: category });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to create category" });
  }
};

// 📄 Get All Categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await ServiceCategory.find().sort({ createdAt: -1 });
    res.json({ success: true, data: categories });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to fetch categories" });
  }
};

// 🔍 Get Category by ID or Slug
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    let category = null;

    // ✅ Check if it's a valid ObjectId first
    if (mongoose.Types.ObjectId.isValid(id)) {
      category = await ServiceCategory.findById(id);
    }

    // ✅ If not found by ID (or invalid), try slug lookup
    if (!category) {
      category = await ServiceCategory.findOne({ slug: id.toLowerCase() });
    }

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.json({ success: true, data: category });
  } catch (e) {
    console.error("❌ getCategoryById error:", e);
    res.status(500).json({ success: false, message: "Failed to fetch category" });
  }
};

// ✏️ Update Category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const category = await ServiceCategory.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.json({ success: true, data: category });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to update category" });
  }
};

// 🗑️ Delete Category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ServiceCategory.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.json({ success: true, message: "Category deleted successfully" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to delete category" });
  }
};

// 🟢 Toggle Active Status
exports.toggleCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await ServiceCategory.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    category.active = !category.active;
    await category.save();

    res.json({ success: true, data: category });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to toggle category status" });
  }
};
