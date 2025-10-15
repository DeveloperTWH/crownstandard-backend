const Service = require("../models/Service");
const User = require("../models/User");
const slugify = require("slugify");

// 🧠 Helper: Check if provider is allowed to manage services
async function validateProviderReadiness(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error("User not found");

  if (user.role !== "provider") throw new Error("Only providers can perform this action");
  if (user.status !== "active") throw new Error("Your account is not active");
  if (user.providerProfile?.approvalStatus !== "approved") throw new Error("Your provider profile is not approved");
  if (!user.providerProfile?.kyc?.verified) throw new Error("KYC verification required before creating services");
  if (!user.emailVerified) throw new Error("Please verify your email before continuing");
  if (!user.phoneVerified) throw new Error("Please verify your phone number before continuing");
  if (!user.providerProfile?.serviceAddress) throw new Error("Please complete your provider profile before listing services");

  return user;
}

// 🛠️ Create a new service
exports.createService = async (req, res) => {
  try {
    await validateProviderReadiness(req.user.id);

    const { title, description, basePrice, priceUnit, minHours, categoryId, includes, exclusions, media } = req.body;
    if (!title || !description || !basePrice || !priceUnit || !categoryId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const slug = slugify(title, { lower: true, strict: true });

    const service = await Service.create({
      providerId: req.user.id,
      title,
      description,
      basePrice,
      priceUnit,
      minHours,
      categoryId,
      includes,
      exclusions,
      media,
      slug,
    });

    return res.status(201).json({ success: true, data: service });
  } catch (e) {
    console.error("createService error:", e);
    return res.status(400).json({ success: false, message: e.message || "Failed to create service" });
  }
};

// ✏️ Update a service
exports.updateService = async (req, res) => {
  try {
    await validateProviderReadiness(req.user.id);

    const { id } = req.params;
    const service = await Service.findOne({ _id: id, providerId: req.user.id });
    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found or not owned by you" });
    }

    const updates = req.body;
    if (updates.title) updates.slug = slugify(updates.title, { lower: true, strict: true });

    const updated = await Service.findByIdAndUpdate(id, updates, { new: true });
    return res.json({ success: true, data: updated });
  } catch (e) {
    console.error("updateService error:", e);
    return res.status(400).json({ success: false, message: e.message || "Failed to update service" });
  }
};

// 🗑️ Soft delete a service
exports.deleteService = async (req, res) => {
  try {
    await validateProviderReadiness(req.user.id);

    const { id } = req.params;
    const service = await Service.findOne({ _id: id, providerId: req.user.id });
    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found or not owned by you" });
    }

    service.isActive = false;
    await service.save();

    return res.json({ success: true, message: "Service deactivated successfully" });
  } catch (e) {
    console.error("deleteService error:", e);
    return res.status(400).json({ success: false, message: e.message || "Failed to delete service" });
  }
};

// 📜 Get all services created by provider
exports.getMyServices = async (req, res) => {
  try {
    await validateProviderReadiness(req.user.id);

    const { page = 1, limit = 10, active } = req.query;
    const query = { providerId: req.user.id };
    if (active !== undefined) query.isActive = active === "true";

    const services = await Service.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Service.countDocuments(query);

    return res.json({
      success: true,
      data: services,
      pagination: {
        page: parseInt(page),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("getMyServices error:", e);
    return res.status(400).json({ success: false, message: e.message || "Failed to fetch services" });
  }
};
