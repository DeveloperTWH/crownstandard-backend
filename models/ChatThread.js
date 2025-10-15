const mongoose = require("mongoose");
const { Schema } = mongoose;

const ChatThreadSchema = new Schema(
  {
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true },
    ],
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
    },
    lastMessage: String,
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

ChatThreadSchema.index({ participants: 1 });

module.exports = mongoose.model("ChatThread", ChatThreadSchema);
