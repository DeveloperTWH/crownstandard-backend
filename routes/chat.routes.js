// routes/chat.routes.js
const router = require("express").Router();
const ThreadCtrl = require("../controllers/chatThread.controller");
const MsgCtrl = require("../controllers/chatMessage.controller");
const validateChatAccess = require("../middleware/validateChatAccess");
const auth = require("../middleware/auth");
const { getThreadDetails } = require("../controllers/chatThread.controller");

router.post("/threads", auth, ThreadCtrl.getOrCreateThread);
router.get("/threads", auth, ThreadCtrl.getMyThreads);
router.get("/thread/:threadId", auth, getThreadDetails);

router.post("/messages/:threadId", auth, validateChatAccess, MsgCtrl.sendMessage);
router.get("/messages/:threadId", auth, validateChatAccess, MsgCtrl.getMessages);
router.patch("/messages/:threadId/read", auth, validateChatAccess, MsgCtrl.markAsRead);




module.exports = router;
