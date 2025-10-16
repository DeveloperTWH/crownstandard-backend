const mongoose = require("mongoose");
const { Schema } = mongoose;

const PhotoSchema = new Schema(
  {
    s3Key: { type: String, required: true },
    width: Number,
    height: Number,
    sizeBytes: Number,
    uploadedBy: {
      type: String,
      enum: ["customer", "provider", "system"],
      default: "customer",
    },
  },
  { _id: false }
);

const PricingSnapshotSchema = new Schema(
  {
    currency: { type: String, default: "CAD", required: true },
    basePrice: { type: Number, required: true },
    priceUnit: { type: String, enum: ["per_hour", "per_service"], required: true },
    minHours: Number,
    totalHours: Number, // captured at booking time
    quotedSubtotal: Number,
    discount: { type: Number, default: 0 },
    totalPayable: { type: Number, required: true },

    // ✅ Commission breakdown (computed and stored at booking time)
    platformCommission: { type: Number, required: true }, // e.g., 25% of totalPayable
    providerShare: { type: Number, required: true }, // e.g., 75% of totalPayable
  },
  { _id: false }
);

const CancellationPolicySchema = new Schema(
  {
    freeBeforeAcceptance: { type: Boolean, default: true },
    lateCancelFeePercent: { type: Number, default: 15 },
  },
  { _id: false }
);

const BookingSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "ServiceCategory",
      required: true,
      index: true,
    },

    // 📦 Booking lifecycle status
    status: {
      type: String,
      enum: [
        "pending_payment",
        "pending_provider_accept",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
        "auto_expired",
        "payment_failed",
      ],
      default: "pending_payment",
      index: true,
    },

    scheduledAt: { type: Date, required: true },

    // ✅ Total duration decided at booking time
    durationHours: { type: Number, required: true },

    // 🖼️ Photos uploaded by customer
    photos: [PhotoSchema],

    // 🏠 Where cleaning should happen
    serviceAddress: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
      location: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
      },
    },

    // 💰 Snapshot of pricing at booking time
    pricingSnapshot: { type: PricingSnapshotSchema, required: true },

    // 📜 Snapshot of cancellation policy
    cancellationPolicySnapshot: { type: CancellationPolicySchema, required: true },

    // 💳 Payment details
    payment: {
      paymentIntentId: { type: String, index: true },
      status: {
        type: String,
        enum: ["pending", "succeeded", "failed", "refunded", "partial_refunded"],
        default: "pending",
      },
      amount: Number,
      currency: { type: String, default: "CAD" }, // ✅ add this
      applicationFee: Number,
      transferAmount: Number,
      refundedAmount: { type: Number, default: 0 },
      capturedAt: Date, // ✅ optional but useful
    },

    // 💸 Payout info (Stripe transfer to provider)
    payout: {
      status: {
        type: String,
        enum: ["not_completed_yet", "pending", "on_hold", "released", "failed", "cancelled"],
        default: "not_completed_yet",
        index: true,
      },
      transferId: String,
      holdReason: String,
      eligibleForReleaseAt: Date, // when payout becomes eligible (completed + 48h)
      releasedAt: Date,           // when payout actually happened
    },

    // 💲 Tip info
    tipSummary: {
      hasTip: { type: Boolean, default: false },
      totalTip: { type: Number, default: 0 },
      currency: { type: String, default: "CAD", required: true },
    },

    // ✅ OTP verification for service start/completion
    completionOtp: {
      code: { type: String }, // 4–6 digit OTP
      verified: { type: Boolean, default: false },
      verifiedAt: Date,
    },

    // 📅 Lifecycle timestamps
    autoExpireAt: { type: Date, index: true },
    acceptedAt: Date,
    completedAt: Date,
    cancelledAt: Date,

    // ⚖️ Dispute status (future-ready)
    disputeStatus: {
      type: String,
      enum: ["none", "open", "resolved_refunded", "resolved_rejected"],
      default: "none",
    },

    // 💬 Optional fields
    chatThreadId: { type: Schema.Types.ObjectId, ref: "ChatThread" },
    notes: String,
    specialInstructions: String,
    rejection: {
      reason: { type: String },
      rejectedAt: Date,
    },
  },
  { timestamps: true }
);

// ✅ Useful indexes
BookingSchema.index({ providerId: 1, scheduledAt: 1 });
BookingSchema.index({ "serviceAddress.location": "2dsphere" });
BookingSchema.index({ customerId: 1, scheduledAt: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ autoExpireAt: 1 });

const Booking = mongoose.model("Booking", BookingSchema);
module.exports = Booking;