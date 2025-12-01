// sockets/chat.socket.js
module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("⚡ user connected:", socket.id);

    // join chat room(thread)
    socket.on("join_thread", (threadId) => {
      socket.join(threadId);
      console.log(`📥 User joined thread ${threadId}`);
    });

    // typing indicator
    socket.on("typing", ({ threadId, userId }) => {
      socket.to(threadId).emit("typing", { userId });
    });

    socket.on("disconnect", () => console.log("❌ user disconnected"));
  });
};
