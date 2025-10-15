const mongoose = require("mongoose");
const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    // 👤 Who performed the action
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // usually an admin
      required: true,
      index: true,
    },

    // 🛠️ What type of action
    actionType: {
      type: String,
      required: true,
      enum: [
        "BOOKING_CANCELLED",
        "PAYOUT_RELEASED",
        "PAYOUT_HELD",
        "REFUND_ISSUED",
        "DISPUTE_RESOLVED",
        "REVIEW_HIDDEN",
        "PROVIDER_APPROVED",
        "PROVIDER_REJECTED",
        "SYSTEM_UPDATE",
        "SUBSCRIPTION_CHANGED",
        "OTHER",
      ],
      index: true,
    },

    // 🎯 What was affected
    targetType: {
      type: String,
      enum: ["booking", "payment", "tip", "dispute", "user", "review", "system"],
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    // 📜 Description
    description: { type: String, required: true },

    // 📊 State before and after (optional snapshots)
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,

    // 📁 Extra metadata
    meta: {
      type: Map,
      of: Schema.Types.Mixed,
    },

    // 🔐 Security info
    ipAddress: String,
  },
  { timestamps: true }
);

// ✅ Indexes for analytics
AuditLogSchema.index({ actionType: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });

const AuditLog = mongoose.model("AuditLog", AuditLogSchema);
module.exports = AuditLog;
