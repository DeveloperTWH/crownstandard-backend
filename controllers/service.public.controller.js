const mongoose = require("mongoose");
const Service = require("../models/Service");
const User = require("../models/User");


const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

// Build sort stage from query + context
function buildSort({ sort, hasTextScore, usingGeo }) {
    // If using geo and no explicit sort, prefer nearest
    if (usingGeo && (!sort || sort === "nearest")) {
        return { distanceKm: 1, createdAt: -1 };
    }
    switch (sort) {
        case "price_asc":
            return { basePrice: 1 };
        case "price_desc":
            return { basePrice: -1 };
        case "rating":
            return { "ratingSummary.avg": -1, "ratingSummary.count": -1, createdAt: -1 };
        case "newest":
            return { createdAt: -1 };
        case "nearest":
            // Only meaningful when using geo
            return usingGeo ? { distanceKm: 1, createdAt: -1 } : { createdAt: -1 };
        default:
            // If text search present, sort by relevance
            return hasTextScore ? { score: { $meta: "textScore" } } : { createdAt: -1 };
    }
}


// Add this at the end of service.public.controller.js
exports.debugServices = async (req, res) => {
    try {
        // Check users
        const users = await User.find({role: "provider"}).lean();
        console.log("Users found:", users.length);
        
        // Check services
        const services = await Service.find().lean();
        console.log("Services found:", services.length);
        
        // Simple aggregation test
        const results = await User.aggregate([
            { $match: { role: "provider" } },
            { $lookup: { from: "services", localField: "_id", foreignField: "providerId", as: "services" } }
        ]);
        
        res.json({
            usersCount: users.length,
            servicesCount: services.length,
            aggregationResults: results.length,
            data: results
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.listServices = async (req, res) => {
    try {
        const {
            lat,
            lng,
            radius = 20, // km
            sort = "nearest", // nearest | rating | price_low | price_high
            categoryId,
            minPrice,
            maxPrice,
            search,
            page = 1,
            limit = 10,
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const radiusMeters = parseFloat(radius) * 1000;

        const pipeline = [];

        // ✅ 1. GEO FILTER (only if lat/lng provided)
//    if (lat && lng) {
//     pipeline.push({
//         $geoNear: {
//             near: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
//             distanceField: "distance",
//             spherical: true,
//             maxDistance: radiusMeters,
//             key: "providerProfile.serviceAddress.location",
//             query: {
//                 role: "provider",
//                 status: "active",  // Fixed: use "active" not "approved"
//                 "providerProfile.approvalStatus": "approved",
//                 "providerProfile.serviceAddress.location": { $exists: true }
//             }
//         }
//     });
// } else {
//     // fallback if no location is provided
//     pipeline.push({
//         $match: {
//             role: "provider",
//             status: "active",  // Fixed: use "active" not "approved"
//             "providerProfile.approvalStatus": "approved",
//         },
//     });
//     pipeline.push({ $addFields: { distance: null } });
// }



        // ✅ 2. Optional: filter by subscription tier or rating (future-ready)
        // pipeline.push({ $match: { "providerProfile.subscriptionTier": "premium" } });

        // ✅ 3. Lookup services for each provider
        pipeline.push({
            $lookup: {
                from: "services",
                localField: "_id",
                foreignField: "providerId",
                as: "services",
                pipeline: [
                    { $match: { isActive: true, isVisible: true } },
                    ...(categoryId
                        ? [{ $match: { categoryId: new mongoose.Types.ObjectId(categoryId) } }]
                        : []),
                    ...(minPrice || maxPrice
                        ? [
                            {
                                $match: {
                                    basePrice: {
                                        ...(minPrice ? { $gte: parseFloat(minPrice) } : {}),
                                        ...(maxPrice ? { $lte: parseFloat(maxPrice) } : {}),
                                    },
                                },
                            },
                        ]
                        : []),
                    ...(search
                        ? [
                            {
                                $match: {
                                    $or: [
                                        { title: { $regex: search, $options: "i" } },
                                        { description: { $regex: search, $options: "i" } },
                                    ],
                                },
                            },
                        ]
                        : []),
                ],
            },
        });

        // ✅ 4. Remove providers with no services
        pipeline.push({
            $match: { "services.0": { $exists: true } },
        });

        // ✅ 5. Sorting
        if (sort === "nearest" && lat && lng) {
            pipeline.push({ $sort: { distance: 1 } });
        } else if (sort === "rating") {
            pipeline.push({ $sort: { "services.ratingSummary.avg": -1 } });
        } else if (sort === "price_low") {
            pipeline.push({ $sort: { "services.basePrice": 1 } });
        } else if (sort === "price_high") {
            pipeline.push({ $sort: { "services.basePrice": -1 } });
        } else {
            pipeline.push({ $sort: { createdAt: -1 } }); // newest providers
        }

        // ✅ 6. Pagination
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: parseInt(limit) });

        // ✅ 7. Optional: project only needed fields
        pipeline.push({
            $project: {
                name: 1,
                email: 1,
                profilePhoto: 1,
                distance: 1,
                "providerProfile.serviceAddress": 1,
                "providerProfile.averageRating": 1,
                services: 1,
            },
        });

        const results = await User.aggregate(pipeline);

        res.json({
            success: true,
            total: results.length,
            page: parseInt(page),
            limit: parseInt(limit),
            data: results,
        });
    } catch (err) {
        console.error("listServices error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch services" });
    }
};


// (Keep your existing getServiceDetail and getRelatedServices as-is)
exports.getServiceDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const byId = isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
        const matchIdOrSlug = byId ? { _id: byId } : { slug: String(id).toLowerCase().trim() };

        const pipeline = [
            { $match: { ...matchIdOrSlug, isActive: true, isVisible: true } },
            {
                $lookup: {
                    from: "users",
                    localField: "providerId",
                    foreignField: "_id",
                    as: "provider",
                },
            },
            { $unwind: "$provider" },
            {
                $match: {
                    "provider.role": "provider",
                    "provider.status": "active",
                    "provider.providerProfile.approvalStatus": "approved",
                    "provider.providerProfile.kyc.verified": true,
                },
            },
            {
                $project: {
                    title: 1,
                    slug: 1,
                    description: 1,
                    basePrice: 1,
                    currency: 1,
                    priceUnit: 1,
                    minHours: 1,
                    includes: 1,
                    exclusions: 1,
                    media: 1,
                    ratingSummary: 1,
                    categoryId: 1,
                    providerId: 1,
                    createdAt: 1,
                    provider: {
                        _id: 1,
                        name: 1,
                        profilePhoto: 1,
                        ratingAverage: 1,
                        "providerProfile.serviceAddress": 1,
                    },
                },
            },
            { $limit: 1 },
        ];

        const docs = await Service.aggregate(pipeline);
        const service = docs[0];
        if (!service) return res.status(404).json({ success: false, message: "Service not found" });

        res.json({ success: true, data: service });
    } catch (e) {
        console.error("getServiceDetail error:", e);
        res.status(500).json({ success: false, message: "Failed to fetch service detail" });
    }
};

exports.getRelatedServices = async (req, res) => {
    try {
        const { id } = req.params;
        const baseService = await Service.findById(id).lean();
        if (!baseService) return res.status(404).json({ success: false, message: "Service not found" });

        const related = await Service.aggregate([
            {
                $match: {
                    _id: { $ne: baseService._id },
                    categoryId: baseService.categoryId,
                    isActive: true,
                    isVisible: true,
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "providerId",
                    foreignField: "_id",
                    as: "provider",
                },
            },
            { $unwind: "$provider" },
            {
                $match: {
                    "provider.role": "provider",
                    "provider.status": "active",
                    "provider.providerProfile.approvalStatus": "approved",
                    "provider.providerProfile.kyc.verified": true,
                },
            },
            {
                $project: {
                    title: 1,
                    slug: 1,
                    basePrice: 1,
                    currency: 1,
                    priceUnit: 1,
                    media: 1,
                    ratingSummary: 1,
                    provider: { _id: 1, name: 1, profilePhoto: 1 },
                },
            },
            { $sort: { "ratingSummary.avg": -1, createdAt: -1 } },
            { $limit: 6 },
        ]);

        res.json({ success: true, data: related });
    } catch (e) {
        console.error("getRelatedServices error:", e);
        res.status(500).json({ success: false, message: "Failed to fetch related services" });
    }
};
