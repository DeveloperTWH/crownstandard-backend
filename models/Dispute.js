const mongoose = require("mongoose");
const { Schema } = mongoose;

const EvidenceSchema = new Schema(
  {
    type: { type: String, enum: ["photo", "text", "document", "chat"], default: "photo" },
    url: String, // S3 URL or chat message reference
    uploadedBy: { type: String, enum: ["customer", "provider", "system"], default: "customer" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DecisionSchema = new Schema(
  {
    outcome: {
      type: String,
      enum: ["refund_full", "refund_partial", "no_refund"],
      default: "no_refund",
    },
    refundAmount: { type: Number, default: 0 },
    tipRefundAmount: { type: Number, default: 0 },
    notes: String,
  },
  { _id: false }
);

const DisputeSchema = new Schema(
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
    paymentTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      required: true,
    },
    tipTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "TipTransaction",
    },

    // 📣 Dispute details
    reason: { type: String, required: true },
    description: { type: String },
    evidence: [EvidenceSchema],

    // 📊 Status
    status: {
      type: String,
      enum: ["open", "under_review", "resolved", "cancelled"],
      default: "open",
      index: true,
    },

    // 🧑‍⚖️ Final decision
    decision: DecisionSchema,

    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" }, // admin
    resolvedAt: Date,
  },
  { timestamps: true }
);

// ✅ Indexes
DisputeSchema.index({ providerId: 1, status: 1 });
DisputeSchema.index({ bookingId: 1, status: 1 });

const Dispute = mongoose.model("Dispute", DisputeSchema);
module.exports = Dispute;
