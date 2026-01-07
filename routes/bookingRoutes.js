const express = require("express");
const router = express.Router();
const { 
  createBooking, acceptBooking, verifyBookingOtp, completeBooking, rejectBooking,
  getAllBookings, getBookingStats, adminCancelBooking, updateBookingStatus,
  syncPayment,
  processStripePayout,
  getCustomerBookings,
  getCustomerDashboard,
  getProviderDashboard,
  getProviderBookings,
  getProviderEarnings
} = require("../controllers/bookingController");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

//customer routes
router.post("/sync-payment", auth, requireRole("customer"), syncPayment);
router.post("/bookings", auth, requireRole("customer"), createBooking);
router.get("/bookings", auth, requireRole("customer"), getCustomerBookings);
router.get("/customer/dashboard", auth, requireRole("customer"), getCustomerDashboard);

///provider routes
router.post("/bookings/:id/accept", auth, requireRole("provider"), acceptBooking);
router.post("/bookings/:id/verify-otp", auth, requireRole("provider"), verifyBookingOtp);
router.post("/bookings/:id/complete", auth, requireRole("provider"), completeBooking);
router.patch( "/bookings/:id/reject", auth, requireRole("provider"), rejectBooking);
router.get("/provider/dashboard", auth, requireRole("provider"), getProviderDashboard);
router.get("/provider/bookings", auth, requireRole("provider"), getProviderBookings);
router.get("/provider/earnings", auth, requireRole("provider"), getProviderEarnings);



// Admin booking routes
router.get("/admin/bookings", auth, requireRole("admin"), getAllBookings);
router.get("/admin/bookings/stats", auth, requireRole("admin"), getBookingStats);
router.patch("/admin/bookings/:id/cancel", auth, requireRole("admin"), adminCancelBooking);
router.patch("/admin/bookings/:id/status", auth, requireRole("admin"), updateBookingStatus);
router.post("/process-stripe-payout", auth, processStripePayout);

module.exports = router;
