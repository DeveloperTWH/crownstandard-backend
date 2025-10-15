const mongoose = require("mongoose");
const { Schema } = mongoose;

const ChatMessageSchema = new Schema(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "ChatThread",
      required: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: String,
    attachments: [
      {
        url: String,
        type: { type: String, enum: ["image", "file"] },
      },
    ],
    type: {
      type: String,
      enum: ["text", "image", "system"],
      default: "text",
    },
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

ChatMessageSchema.index({ threadId: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
