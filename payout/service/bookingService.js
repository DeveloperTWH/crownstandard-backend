/**
 * /payout/service/bookingService.js
 * ---------------------------------------------------------------
 * Handles booking retrieval and eligibility validation
 * for payout processing.
 * ---------------------------------------------------------------
 */

const Booking = require("../../models/Booking");
const mongoose = require("mongoose");

class BookingService {
  /**
   * Fetches a booking and validates payout eligibility.
   * Conditions:
   *  - Booking exists
   *  - Status = "completed"
   *  - Payout status not released/cancelled/failed
   *  - 48 hours have passed since completion
   *  - No payout already created
   */
  static async getBookingIfEligible(bookingId) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) return null;

    // 1️⃣ Fetch booking with all payout-related details
    const booking = await Booking.findById(bookingId).lean(false);
    if (!booking) return null;

    // 2️⃣ Must be completed
    if (booking.status !== "completed") {
      console.log(`⛔ Booking ${bookingId} not completed yet.`);
      return null;
    }

    // 3️⃣ Must have eligibleForReleaseAt
    if (!booking.payout?.eligibleForReleaseAt) {
      console.log(`⛔ Booking ${bookingId} missing eligibleForReleaseAt.`);
      return null;
    }

    // 4️⃣ Must be 48h past completion
    const now = new Date();
    if (booking.payout.eligibleForReleaseAt > now) {
      console.log(`⏳ Booking ${bookingId} not yet eligible for payout.`);
      return null;
    }

    // 5️⃣ Disallow already released or failed payouts
    const disallowedStatuses = ["released", "failed", "cancelled"];
    if (disallowedStatuses.includes(booking.payout.status)) {
      console.log(`⚠️ Booking ${bookingId} already processed for payout.`);
      return null;
    }

    // 6️⃣ Ensure provider ID exists (for Stripe destination)
    if (!booking.providerId) {
      console.log(`⚠️ Booking ${bookingId} missing providerId.`);
      return null;
    }

    return booking;
  }

  /**
   * Marks payout status on booking (e.g., pending, released, failed)
   */
  static async updatePayoutStatus(bookingId, status, extra = {}) {
    try {
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            "payout.status": status,
            ...(extra.releasedAt && { "payout.releasedAt": extra.releasedAt }),
            ...(extra.holdReason && { "payout.holdReason": extra.holdReason }),
          },
        },
        { new: true }
      );
      console.log(`✅ Booking ${bookingId} payout status updated → ${status}`);
    } catch (err) {
      console.error("❌ Failed to update booking payout status:", err);
    }
  }

  /**
   * Fetches all eligible bookings (for EventBridge hourly trigger)
   * Used by eventListener.js → to push to SQS
   */
  static async getEligibleBookingsForPayout() {
    const now = new Date();
    const bookings = await Booking.find({
      status: "completed",
      "payout.status": { $in: ["pending", "not_completed_yet"] },
      "payout.eligibleForReleaseAt": { $lte: now },
      disputeStatus: "none",
    }).select("_id providerId payout eligibleForReleaseAt");

    return bookings;
  }
}

module.exports = BookingService;
