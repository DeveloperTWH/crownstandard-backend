// controllers/chatThread.controller.js
const ChatThread = require("../models/ChatThread");
const Booking = require("../models/Booking");
const { connectedUsers } = require("../sockets/chat.socket");


exports.getOrCreateThread = async (req, res) => {
  const { bookingId } = req.body;
  const userId = req.user._id;
  console.log(userId,"userid")
  console.log(bookingId,"bookingid")

  // Validate booking exists and user is allowed
  const booking = await Booking.findById(bookingId);

  if (!booking) return res.status(404).json({ message: "Booking not found" });

  if (![booking.customerId.toString(), booking.providerId.toString()].includes(userId.toString()))
    return res.status(403).json({ message: "You are not a participant in this booking" });

  // find thread
  let thread = await ChatThread.findOne({ bookingId });

  // if not exists → create new
  if (!thread) {
    thread = await ChatThread.create({
      bookingId,
      participants: [booking.customerId, booking.providerId]
    });
  }

  res.json({ thread });
};


exports.getMyThreads = async (req, res) => {
  const userId = req.user._id.toString();

  const threads = await ChatThread.find({ participants: userId })
    .sort({ lastActivityAt: -1 })
    .populate("participants", "name profilePhoto role") 
    .populate("bookingId")
    .lean();

  // --- Use the imported connectedUsers store ---
  const threadsWithStatus = threads.map(thread => {
    
    const otherParticipant = thread.participants.find(
        p => p._id.toString() !== userId
    );

    let isOnline = false;

    console.log("otherpartcipents",otherParticipant)

    if (otherParticipant) {
        const otherParticipantId = otherParticipant._id.toString();
        
        // Check the shared store: is the other user's ID a key?
        // And does the Set associated with the key have at least one entry?
        if (connectedUsers[otherParticipantId] && connectedUsers[otherParticipantId].size > 0) {
            isOnline = true;
        }
    }

    return {
        ...thread,
        // Attach the online status flag
        online: isOnline, 
        // Ensure 'name' is the other participant's name for the client UI
        name: otherParticipant ? otherParticipant.name : 'Unknown User', 
    };
  });

  res.json({ threads: threadsWithStatus });
};

// exports.getMyThreads = async (req, res) => {
//   const userId = req.user._id;

//   console.log("userid",userId)

//   const threads = await ChatThread.find({ participants: userId })
//     .sort({ lastActivityAt: -1 })
//     .populate("participants", "name profilePhoto role")  // 🔥 sending user details
//     .populate("bookingId");

//   res.json({ threads });
// };





exports.getThreadDetails = async (req, res) => {
  try {
    const { threadId } = req.params;

    const thread = await ChatThread.findById(threadId)
      .populate("participants", "name profilePhoto role")
      .lean();

    if (!thread) return res.status(404).json({ message: "Thread not found" });

    res.json({ thread });

  } catch (err) {
    console.error("Get thread error:", err);
    res.status(500).json({ message: "Server error" });
  }
};