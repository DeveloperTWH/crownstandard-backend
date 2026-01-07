const Service = require("../models/Service");
const User = require("../models/User");
const slugify = require("slugify");

// 🧠 Helper: Check if provider is allowed to manage services
async function validateProviderReadiness(userId) {
  const user = await User.findById(userId.toString()).lean();
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
    // Skip validation for now - direct service creation
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { title, description, basePrice, priceUnit, minHours, categoryId, includes, exclusions, media } = req.body;
    if (!title || !description || !basePrice || !priceUnit || !categoryId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const slug = slugify(title, { lower: true, strict: true });

    const service = await Service.create({
      providerId: req.user._id, // Use _id instead of id
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
    // Debug: Check what's in req.user
    console.log("req.user:", req.user);
    
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const providerId = req.user._id;
    const { page = 1, limit = 10, active } = req.query;
    
    const query = { providerId };
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
    return res.status(500).json({ success: false, message: e.message || "Failed to fetch services" });
  }
};





// Get all services (Admin only)
exports.getAllServices = async (req, res) => {
  try {
    const { page = 1, limit = 20, isActive, isVisible, providerId, categoryId, search } = req.query;
    
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (isVisible !== undefined) query.isVisible = isVisible === 'true';
    if (providerId) query.providerId = providerId;
    if (categoryId) query.categoryId = categoryId;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const services = await Service.find(query)
      .populate('providerId', 'name email')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Service.countDocuments(query);
    
    res.json({
      success: true,
      data: services,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch services' });
  }
};

// Toggle service visibility (Admin only)
exports.toggleServiceVisibility = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    service.isVisible = !service.isVisible;
    await service.save();
    
    res.json({ 
      success: true, 
      message: `Service ${service.isVisible ? 'made visible' : 'hidden'}`,
      data: service 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to toggle service visibility' });
  }
};

// Delete service (Admin only)
exports.adminDeleteService = async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete service' });
  }
};

// Add to service.controller.js
exports.approveService = async (req, res) => {
  try {
    const { approvalStatus } = req.body; // 'approved' or 'rejected'
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    service.isVisible = approvalStatus === 'approved';
    service.approvalStatus = approvalStatus; // Add this field to model
    service.approvedAt = approvalStatus === 'approved' ? new Date() : null;
    await service.save();
    
    res.json({ 
      success: true, 
      message: `Service ${approvalStatus}`,
      data: service 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to approve service' });
  }
};

exports.updateServicePricing = async (req, res) => {
  try {
    const { basePrice, priceUnit, minHours } = req.body;
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { basePrice, priceUnit, minHours },
      { new: true }
    );
    
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update pricing' });
  }
};


exports.featureService = async (req, res) => {
  try {
    const { featured } = req.body;
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { featured: featured === true }, // Add featured field to model
      { new: true }
    );
    
    res.json({ 
      success: true, 
      message: `Service ${featured ? 'featured' : 'unfeatured'}`,
      data: service 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to feature service' });
  }
};

exports.bulkUpdateServices = async (req, res) => {
  try {
    const { serviceIds, action, value } = req.body;
    
    let updateQuery = {};
    switch(action) {
      case 'visibility':
        updateQuery.isVisible = value;
        break;
      case 'active':
        updateQuery.isActive = value;
        break;
      case 'featured':
        updateQuery.featured = value;
        break;
    }
    
    const result = await Service.updateMany(
      { _id: { $in: serviceIds } },
      updateQuery
    );
    
    res.json({ 
      success: true, 
      message: `Updated ${result.modifiedCount} services`,
      modifiedCount: result.modifiedCount 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Bulk update failed' });
  }
};

exports.getServiceStats = async (req, res) => {
  try {
    const stats = await Service.aggregate([
      {
        $group: {
          _id: null,
          totalServices: { $sum: 1 },
          activeServices: { $sum: { $cond: ['$isActive', 1, 0] } },
          visibleServices: { $sum: { $cond: ['$isVisible', 1, 0] } },
          avgPrice: { $avg: '$basePrice' }
        }
      }
    ]);
    
    const categoryStats = await Service.aggregate([
      {
        $group: {
          _id: '$categoryId',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'servicecategories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      }
    ]);
    
    res.json({ 
      success: true, 
      data: {
        overview: stats[0] || {},
        byCategory: categoryStats
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get stats' });
  }
};
