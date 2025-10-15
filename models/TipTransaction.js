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

    paymentIntentId: { type: String, required: true, index: true },
    chargeId: { type: String, index: true },

    amount: { type: Number, required: true },
    currency: { type: String, default: "USD", required: true },

    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "refunded", "partial_refunded"],
      default: "pending",
      index: true,
    },

    refundedAmount: { type: Number, default: 0 },
    refundedAt: Date,

    payoutStatus: {
      type: String,
      enum: ["pending", "on_hold", "released", "cancelled"],
      default: "pending",
      index: true,
    },
    payoutReleasedAt: Date,
    holdReason: String,

    metadata: {
      type: Map,
      of: String,
    },
  },
  { timestamps: true }
);

TipTransactionSchema.index({ providerId: 1, payoutStatus: 1 });
TipTransactionSchema.index({ status: 1 });

const TipTransaction = mongoose.model("TipTransaction", TipTransactionSchema);
module.exports = TipTransaction;
