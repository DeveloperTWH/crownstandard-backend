const mongoose = require("mongoose");
const { Schema } = mongoose;

const PayoutSchema = new Schema(
  {
    // 🧑‍🔧 Provider to whom payout is made
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // 📦 Related entities
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    paymentTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      required: true,
    },
    tipTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "TipTransaction",
    },

    // 💸 Amount details
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "CAD",
    },

    // 🪙 Idempotency (prevents double payout creation)
    idempotencyKey: { type: String, index: true },

    // 📊 Type of payout
    payoutType: {
      type: String,
      enum: ["booking", "tip", "adjustment", "refund"],
      default: "booking",
    },
    adjustmentReason: { type: String },
    // 📤 Payout lifecycle status
    status: {
      type: String,
      enum: ["scheduled", "processing", "transferred", "on_hold", "failed"],
      default: "scheduled",
      index: true,
    },

    // 📅 Timestamps and tracking
    releaseDate: Date,           // When payout is scheduled
    transferredAt: Date,         // When payout was actually sent
    attempts: { type: Number, default: 0 }, // Retry attempts counter

    // ⚠️ Failure / hold metadata
    holdReason: String,
    failureReason: String,

    // 🔗 Stripe references
    stripeTransferId: String,

    // 📜 Metadata for reporting or audit
    metadata: {
      type: Map,
      of: String,
    },
  },
  { timestamps: true }
);

// ✅ Useful indexes
PayoutSchema.index({ providerId: 1, status: 1 });
PayoutSchema.index({ bookingId: 1 });
PayoutSchema.index({ payoutType: 1 });
PayoutSchema.index({ idempotencyKey: 1 });

module.exports = mongoose.model("Payout", PayoutSchema);
