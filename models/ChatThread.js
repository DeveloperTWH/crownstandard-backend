const mongoose = require("mongoose");
const { Schema } = mongoose;

const ChatThreadSchema = new Schema(
  {
    // Only 2 participants → customer + provider
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true }
    ],

    // Chat belongs to one Booking — mandatory (so chat is only booking-linked)
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true
    },

    // Store preview + allow unread count later
    lastMessage: {
      text: String,
      sender: { type: Schema.Types.ObjectId, ref: "User" }
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {}
    },

    // Helps sort conversation lists easily
    lastActivityAt: {
      type: Date,
      default: Date.now
    },

    // Close chat automatically after booking done + 48 hrs if needed
    isActive: { type: Boolean, default: true },

    // Maintain for dispute audit
    closedReason: { type: String, enum: ["completed", "cancelled", "dispute", null], default: null },
  },
  { timestamps: true }
);

// Indexes for speed
ChatThreadSchema.index({ participants: 1 });
ChatThreadSchema.index({ bookingId: 1 });
ChatThreadSchema.index({ lastActivityAt: -1 });

module.exports = mongoose.model("ChatThread", ChatThreadSchema);
