const mongoose = require("mongoose");
const { Schema } = mongoose;

const PaymentTransactionSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true, // one transaction per booking
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
    amount: { type: Number, required: true }, // total paid by customer
    applicationFee: { type: Number, required: true }, // platform fee (e.g. 25%)
    transferAmount: { type: Number, required: true }, // payout amount (e.g. 75%)

    // 💳 Payment method
    method: {
      type: String,
      enum: ["card", "upi", "wallet", "bank_redirect"],
      default: "card",
    },

    // 📊 Status
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "refunded", "partial_refunded"],
      default: "pending",
      index: true,
    },

    // 🔁 Refund info
    refundedAmount: { type: Number, default: 0 },
    refundedAt: Date,
  },
  { timestamps: true }
);

// ✅ Indexes
PaymentTransactionSchema.index({ bookingId: 1 });
PaymentTransactionSchema.index({ status: 1 });

const PaymentTransaction = mongoose.model("PaymentTransaction", PaymentTransactionSchema);
module.exports = PaymentTransaction;
