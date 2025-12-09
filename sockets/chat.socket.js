
const socketAuthMiddleware = require('../middleware/socketAuth');


const connectedUsers = {}; 



module.exports = (io) => {
    // 2. APPLY the authentication middleware
    io.use(socketAuthMiddleware);

    io.on("connection", (socket) => {
        // User ID is available thanks to the middleware!
        const userId = socket.userId; 
        const socketId = socket.id;

        console.log(`⚡ User connected: ${socketId} (User ID: ${userId})`);

        // --- CONNECTION LOGIC ---
        let isFirstConnection = false;
        if (!connectedUsers[userId]) {
            connectedUsers[userId] = new Set();
            isFirstConnection = true;
        }
        connectedUsers[userId].add(socketId);

        // If first connection, broadcast status
        if (isFirstConnection) {
            console.log(`🟢 User ${userId} is now ONLINE.`);
            socket.broadcast.emit("user:status:online", { userId });
        }
        
        // 🔥 DEBUG: Log the current state of the store after connection
        console.log(`DEBUG (Connect): Active User IDs: ${Object.keys(connectedUsers)}`);
        
        // join chat room(thread)
        socket.on("join_thread", (threadId) => {
            socket.join(threadId);
            console.log(`📥 User ${userId} joined thread ${threadId}`);
        });

        // typing indicator
       socket.on("typing", ({ threadId }) => {
            // socket.to(threadId) ensures the event goes to everyone in the room EXCEPT the sender.
            socket.to(threadId).emit("typing", { userId: socket.userId });     
        });
        
        // You will need a complementary 'stopped_typing' event
        socket.on("stopped_typing", ({ threadId }) => {
            socket.to(threadId).emit("stopped_typing", { userId: socket.userId });     
        });

        // --- DISCONNECTION LOGIC ---
        socket.on("disconnect", () => {
            console.log(`❌ User disconnected: ${socketId} (User ID: ${userId})`);

            connectedUsers[userId]?.delete(socketId);

            // If no remaining sockets, broadcast OFFLINE
            if (connectedUsers[userId]?.size === 0) {
                delete connectedUsers[userId];
                console.log(`🔴 User ${userId} is now OFFLINE.`);
                io.emit("user:status:offline", { userId });
                
                // 🔥 DEBUG: Log the current state of the store after final disconnect
                console.log(`DEBUG (Disconnect): Active User IDs: ${Object.keys(connectedUsers)}`);
            } else {
                // 🔥 DEBUG: Log if the user still has active sockets
                console.log(`DEBUG (Disconnect): User ${userId} still has ${connectedUsers[userId].size} active socket(s).`);
            }
        });
    });
};

module.exports.connectedUsers = connectedUsers;


// module.exports = (io) => {
//   io.on("connection", (socket) => {
//     console.log("⚡ user connected:", socket.id);

//     // join chat room(thread)
//     socket.on("join_thread", (threadId) => {
//       socket.join(threadId);
//       console.log(`📥 User joined thread ${threadId}`);
//     });

//     // typing indicator
//     socket.on("typing", ({ threadId, userId }) => {
//       socket.to(threadId).emit("typing", { userId });     
//     });

//     socket.on("disconnect", () => console.log("❌ user disconnected"));
//   });
// };
