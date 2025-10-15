const mongoose = require("mongoose");
const { Schema } = mongoose;

const NotificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      index: true,
    },

    // 📣 Type of notification
    type: {
      type: String,
      enum: [
        "booking",
        "payment",
        "dispute",
        "review",
        "subscription",
        "chat",
        "admin",
      ],
      required: true,
    },

    // 📩 Message content
    title: { type: String, required: true },
    message: { type: String, required: true },

    // 🔗 Optional action link (e.g., /bookings/:id)
    actionUrl: String,

    // 📊 Status
    isRead: { type: Boolean, default: false, index: true },
    isPushed: { type: Boolean, default: false },

    // 📁 Extra info (optional)
    meta: {
      type: Map,
      of: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// ✅ Helpful indexes
NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ type: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", NotificationSchema);
module.exports = Notification;
