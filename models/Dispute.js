const mongoose = require("mongoose");
const { Schema } = mongoose;

// 📎 Evidence attached to a dispute
const EvidenceSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["photo", "text", "document", "chat"],
      default: "photo",
    },
    url: String, // S3 URL or chat reference
    uploadedBy: {
      type: String,
      enum: ["customer", "provider", "system"],
      default: "customer",
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// 🧑‍⚖️ Final decision details
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
    // 🔗 Core references
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
    disputeType: {
      type: String,
      enum: ["service_quality", "refund_request", "fraud", "other"],
      default: "service_quality",
      index: true,
    },
    disputeSource: {
      type: String,
      enum: ["customer", "provider", "system"],
      default: "customer",
    },
    reason: { type: String, required: true },
    description: String,
    evidence: [EvidenceSchema],

    // 📊 Status tracking
    status: {
      type: String,
      enum: ["open", "under_review", "resolved", "cancelled"],
      default: "open",
      index: true,
    },
    refundStatus: {
      type: String,
      enum: ["not_applicable", "pending", "processed", "failed"],
      default: "not_applicable",
      index: true,
    },

    // 🧑‍⚖️ Final decision
    decision: DecisionSchema,

    // 🧑‍💻 Admin & resolution tracking
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date,
    reviewStartedAt: Date,
    adminNotes: String,

    // 🔗 External system references (e.g., Stripe dispute)
    externalRef: { type: String, index: true },

  },
  { timestamps: true }
);

// ✅ Useful indexes
DisputeSchema.index({ providerId: 1, status: 1 });
DisputeSchema.index({ bookingId: 1, status: 1 });
DisputeSchema.index({ disputeType: 1 });
DisputeSchema.index({ refundStatus: 1 });

const Dispute = mongoose.model("Dispute", DisputeSchema);
module.exports = Dispute;
