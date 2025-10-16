const mongoose = require("mongoose");
const { Schema } = mongoose;

const PaymentTransactionSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true, // ✅ removed unique:true to allow retries or edge cases
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

    // 💰 Amount breakdown
    currency: { type: String, default: "USD", required: true },
    amount: { type: Number, required: true },           // total paid by customer
    applicationFee: { type: Number, required: true },   // platform fee (e.g., 25%)
    transferAmount: { type: Number, required: true },   // payout amount (e.g., 75%)

    // 💳 Payment method
    method: {
      type: String,
      enum: ["card", "upi", "wallet", "bank_redirect"],
      default: "card",
    },

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

    // 🪙 Idempotency key (critical for preventing duplicate charges)
    idempotencyKey: { type: String, index: true },

    // 💸 Payout tracking
    transferStatus: {
      type: String,
      enum: ["not_initiated", "scheduled", "transferred", "failed"],
      default: "not_initiated",
    },
    transferId: { type: String }, // Stripe transfer ID (if payout initiated)

    // ⚖️ Dispute lifecycle
    disputeStatus: {
      type: String,
      enum: ["none", "open", "won", "lost"],
      default: "none",
    },

    // 📜 Optional metadata (good for debugging or reconciliation)
    metadata: {
      type: Map,
      of: String,
    },

    // 🪵 Optional raw event log from Stripe webhook (for audit/debugging)
    rawEventLog: Schema.Types.Mixed,
  },
  { timestamps: true }
);

// ✅ Indexes for performance
PaymentTransactionSchema.index({ bookingId: 1 });
PaymentTransactionSchema.index({ paymentIntentId: 1 });
PaymentTransactionSchema.index({ status: 1 });
PaymentTransactionSchema.index({ providerId: 1 });
PaymentTransactionSchema.index({ idempotencyKey: 1 });

const PaymentTransaction = mongoose.model("PaymentTransaction", PaymentTransactionSchema);
module.exports = PaymentTransaction;
