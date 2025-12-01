const mongoose = require("mongoose");
const { Schema } = mongoose;

const ChatMessageSchema = new Schema(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "ChatThread",
      required: true,
      index: true
    },

    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Generic message container
    message: { type: String, trim: true },

    attachments: [
      {
        url: String,
        type: { type: String, enum: ["image", "file", "audio"] }
      }
    ],

    type: {
      type: String,
      enum: ["text", "image", "file", "audio", "system"],
      default: "text"
    },

    // Read receipt tracking
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // Soft delete
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

ChatMessageSchema.index({ threadId: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
