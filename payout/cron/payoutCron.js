// payout/cron/payoutCron.js
/**
 * CrownStandard Payout Cron Job
 * -----------------------------------------------------
 * Runs hourly to detect bookings eligible for payout release.
 * Delegates payout creation to PayoutService.
 */

const mongoose = require("mongoose");
const Booking = require("../../models/Booking");
const PayoutService = require("../services/payoutService");
const AuditLogService = require("../services/auditLogService");

require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;


(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB for payout cron.");
    await runPayoutCron();
    // await mongoose.disconnect();
    console.log("🏁 Payout cron job complete.");
  } catch (err) {
    console.error("❌ Payout cron failed:", err.message);
    process.exit(1);
  }
})();


/**
 * Main cron handler — finds eligible bookings and initiates payouts.
 */
async function runPayoutCron() {
  const now = new Date();

  console.log("🕒 Running hourly payout cron:", now.toISOString());

  // Find all bookings eligible for payout
  const eligibleBookings = await Booking.find({
    "payout.status": "not_completed_yet",
    disputeStatus: "none",
    status: "completed",
    "payout.eligibleForReleaseAt": { $lte: now },
  })
    .sort({ completedAt: 1 })
    .limit(50)
    .lean();

  if (!eligibleBookings.length) {
    console.log("ℹ️ No bookings eligible for payout this cycle.");
    return;
  }

  console.log(`🔍 Found ${eligibleBookings.length} bookings eligible for payout.`);

  for (const booking of eligibleBookings) {
    try {
      await PayoutService.createPayoutForBooking(booking._id);
      console.log(`✅ Payout scheduled for booking ${booking._id}`);
    } catch (err) {
      console.error(`❌ Failed to create payout for booking ${booking._id}:`, err.message);
      await AuditLogService.logError(err, "payoutCron.runPayoutCron", {
        bookingId: booking._id,
      });
    }
  }
}
