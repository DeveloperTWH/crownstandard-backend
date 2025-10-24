/**
 * /payout/service/tipService.js
 * ---------------------------------------------------------------
 * Handles fetching and validating tip transactions for a booking.
 * Ensures only successful (non-refunded) tips are included in payout.
 * ---------------------------------------------------------------
 */

const TipTransaction = require("../../models/TipTransaction");

class TipService {
  /**
   * Fetches a successful tip transaction for a given booking (if any).
   * Ensures it’s valid, succeeded, and not fully refunded.
   *
   * @param {ObjectId} bookingId
   * @returns {TipTransaction|null}
   */
  static async getTipForBooking(bookingId) {
    try {
      // 1️⃣ Find latest tip transaction for the booking
      const tipTx = await TipTransaction.findOne({
        bookingId,
      }).sort({ createdAt: -1 });

      if (!tipTx) {
        console.log(`💡 No tip found for booking ${bookingId}`);
        return null;
      }

      // 2️⃣ Tip must have succeeded
      const validStatuses = ["succeeded", "partial_refunded"];
      if (!validStatuses.includes(tipTx.status)) {
        console.log(
          `⛔ Tip status ${tipTx.status} not eligible for payout (booking ${bookingId})`
        );
        return null;
      }

      // 3️⃣ Check refund conditions
      const total = tipTx.amount || 0;
      const refunded = tipTx.refundedAmount || 0;

      if (refunded >= total) {
        console.log(`⚠️ Tip for booking ${bookingId} fully refunded — ignored.`);
        return null;
      }

      // 4️⃣ Ensure not already released via payout
      if (["released", "failed", "cancelled"].includes(tipTx.payoutStatus)) {
        console.log(
          `⚠️ Tip payout already processed for booking ${bookingId}.`
        );
        return null;
      }

      return tipTx;
    } catch (err) {
      console.error("❌ Tip fetch error:", err);
      return null;
    }
  }

  /**
   * Marks a tip transaction as released or failed after payout.
   */
  static async updateTipPayoutStatus(tipTransactionId, status, transferId = null) {
    try {
      await TipTransaction.findByIdAndUpdate(tipTransactionId, {
        $set: {
          payoutStatus: status,
          ...(transferId && { transferId }),
          ...(status === "released" && { releasedAt: new Date() }),
        },
      });

      console.log(`✅ TipTransaction ${tipTransactionId} payout → ${status}`);
    } catch (err) {
      console.error("❌ Failed to update Tip payout status:", err);
    }
  }

  /**
   * Calculates total tip amount for a given provider across bookings.
   * Useful for analytics or reporting.
   */
  static async getTotalTipsForProvider(providerId) {
    const tips = await TipTransaction.aggregate([
      { $match: { providerId, status: "succeeded" } },
      {
        $group: {
          _id: "$providerId",
          totalTips: { $sum: "$amount" },
        },
      },
    ]);

    return tips.length ? tips[0].totalTips : 0;
  }
}

module.exports = TipService;
