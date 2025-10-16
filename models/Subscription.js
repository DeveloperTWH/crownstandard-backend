const mongoose = require("mongoose");
const { Schema } = mongoose;

const SubscriptionSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    price: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "CAD",
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      required: true,
    },
    features: [String],
    isActive: {
      type: Boolean,
      default: true,
    },
    stripePlanId: String,

    subscribers: [
      {
        providerId: { type: Schema.Types.ObjectId, ref: "User" },
        startDate: Date,
        endDate: Date,
        status: {
          type: String,
          enum: ["active", "expired", "cancelled"],
          default: "active",
        },
      },
    ],
  },
  { timestamps: true }
);

SubscriptionSchema.index({ isActive: 1 });

module.exports = mongoose.model("Subscription", SubscriptionSchema);
