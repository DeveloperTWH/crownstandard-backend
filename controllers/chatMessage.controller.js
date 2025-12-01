// controllers/chatMessage.controller.js
const ChatMessage = require("../models/ChatMessage");
const ChatThread = require("../models/ChatThread");

exports.sendMessage = async (req, res) => {
    const { threadId } = req.params;
    const { message, attachments } = req.body;
    const senderId = req.user._id;

    const msg = await ChatMessage.create({
        threadId,
        senderId,
        message,
        attachments,
        type: attachments?.length ? "image" : "text"
    });

    // update thread meta
    await ChatThread.findByIdAndUpdate(threadId, {
        lastMessage: { text: message, sender: senderId },
        lastActivityAt: new Date()
    });

    // SOCKET EMIT ⬇
    req.io.to(threadId).emit("new_message", {
        _id: msg._id,
        message: msg.message,
        senderId,               // 🔥 important
        threadId,
        createdAt: msg.createdAt
    });

    res.json({ msg });
};

exports.getMessages = async (req, res) => {
    const { threadId } = req.params;

    const messages = await ChatMessage.find({ threadId })
        .sort({ createdAt: 1 });

    res.json({ messages });
};

exports.markAsRead = async (req, res) => {
    const { threadId } = req.params;
    const userId = req.user._id;

    await ChatMessage.updateMany(
        { threadId, readBy: { $ne: userId } },
        { $push: { readBy: userId } }
    );

    req.io.to(threadId).emit("message_read", { userId, threadId });

    res.json({ message: "Marked read" });
};
