const mongoose = require("mongoose");
const { Schema } = mongoose;

const TipTransactionSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
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

    // 🔗 Stripe references
    paymentIntentId: { type: String, required: true, index: true },
    chargeId: { type: String, index: true },

    // 💰 Tip details
    amount: { type: Number, required: true },
    currency: { type: String, default: "CAD", required: true },

    // 📊 Payment status
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "refunded", "partial_refunded"],
      default: "pending",
      index: true,
    },

    // 🔁 Refund info
    refundedAmount: { type: Number, default: 0 },
    refundedAt: Date,

    // 🪙 Idempotency key (prevents duplicate tip charges)
    idempotencyKey: { type: String, index: true },

    // 💸 Payout tracking
    payoutStatus: {
      type: String,
      enum: ["not_initiated", "scheduled", "released", "failed", "cancelled"],
      default: "not_initiated",
      index: true,
    },
    transferId: { type: String }, // Stripe transfer ID
    releasedAt: Date, // ✅ renamed from payoutReleasedAt for consistency
    holdReason: String,

    // ⚖️ Dispute lifecycle
    disputeStatus: {
      type: String,
      enum: ["none", "open", "won", "lost"],
      default: "none",
    },

    // 📜 Metadata for analytics or debugging
    metadata: {
      type: Map,
      of: String,
    },

    // raw Stripe event data (for audits/debugging)
    rawEventLog: Schema.Types.Mixed,
  },
  { timestamps: true }
);

// ✅ Indexes for performance
TipTransactionSchema.index({ bookingId: 1 });
TipTransactionSchema.index({ providerId: 1, payoutStatus: 1 });
TipTransactionSchema.index({ status: 1 });
TipTransactionSchema.index({ paymentIntentId: 1 });
TipTransactionSchema.index({ idempotencyKey: 1 });

const TipTransaction = mongoose.model("TipTransaction", TipTransactionSchema);
module.exports = TipTransaction;
