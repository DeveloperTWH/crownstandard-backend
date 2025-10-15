const mongoose = require("mongoose");
const { Schema } = mongoose;

const CouponSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ["percent", "flat"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
    },
    maxUses: Number,
    usedCount: {
      type: Number,
      default: 0,
    },
    validFrom: Date,
    validTo: Date,
    active: {
      type: Boolean,
      default: true,
    },
    appliesTo: {
      type: String,
      enum: ["all", "category", "provider", "service"],
      default: "all",
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "ServiceCategory",
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
    },
  },
  { timestamps: true }
);

CouponSchema.index({ code: 1 });
CouponSchema.index({ active: 1, validTo: 1 });

module.exports = mongoose.model("Coupon", CouponSchema);
