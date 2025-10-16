const mongoose = require("mongoose");
const { Schema } = mongoose;

const ServiceSchema = new Schema(
  {
    // 👤 Provider who created the service
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // 🏷️ Category reference
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "ServiceCategory",
      required: true,
      index: true,
    },

    // 🧾 Basic info
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // 💸 Pricing
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "CAD",
      required: true,
    },
    priceUnit: {
      type: String,
      enum: ["per_hour", "per_service"],
      required: true,
    },
    minHours: {
      type: Number, // only required if priceUnit = per_hour
    },

    // ✅ Extra details
    includes: [String],
    exclusions: [String],

    // 📸 Media (S3 URLs)
    media: [
      {
        type: String,
      },
    ],

    // 🟢 Provider control
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // 🔒 Admin control
    isVisible: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ⭐ Rating summary (denormalized for fast queries)
    ratingSummary: {
      avg: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

//
// 📊 Indexes for search and performance
//
ServiceSchema.index({ title: "text", description: "text" });
ServiceSchema.index({ categoryId: 1, isActive: 1, isVisible: 1 });
ServiceSchema.index({ providerId: 1, isActive: 1, isVisible: 1 });

//
// ✅ Validation: minHours is required if pricing is per hour
//
ServiceSchema.path("minHours").validate(function (v) {
  if (this.priceUnit === "per_hour") return v && v >= 1;
  return true;
}, "minHours is required and must be >= 1 when priceUnit is 'per_hour'");

//
// 🧠 Virtual: quickly check if service should be listed
//
ServiceSchema.virtual("isListable").get(function () {
  return this.isActive && this.isVisible;
});

const Service = mongoose.model("Service", ServiceSchema);
module.exports = Service;
