const express = require("express");
const router = express.Router();
const { createBooking, acceptBooking, verifyBookingOtp, completeBooking, rejectBooking } = require("../controllers/bookingController");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

router.post("/bookings", auth, requireRole("customer"), createBooking);
router.post("/bookings/:id/accept", auth, requireRole("provider"), acceptBooking);
router.post("/bookings/:id/verify-otp", auth, requireRole("provider"), verifyBookingOtp);
router.post("/bookings/:id/complete", auth, requireRole("provider"), completeBooking);
router.patch( "/bookings/:id/reject", auth, requireRole("provider"), rejectBooking);


module.exports = router;
