// middlewares/validateChatAccess.js
const ChatThread = require("../models/ChatThread");
const Booking = require("../models/Booking");

module.exports = async (req, res, next) => {
  const { threadId } = req.params;
  const userId = req.user._id;

  const thread = await ChatThread.findById(threadId)
    .populate("bookingId participants");

  if (!thread) return res.status(404).json({ message: "Thread not found" });

  // must belong to booking or must be admin
  const allowed = thread.participants.some(p => p.equals(userId)) || req.user.role === "admin";

  if (!allowed) return res.status(403).json({ message: "Unauthorized chat access" });

  req.thread = thread;
  next();
};
