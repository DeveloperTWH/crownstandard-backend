/**
 * /payout/service/disputeService.js
 * ---------------------------------------------------------------
 * Handles dispute checks for payouts.
 * Determines if payout should be held or adjusted based on
 * dispute status and decision outcome.
 * ---------------------------------------------------------------
 */

const Dispute = require("../../models/Dispute");

class DisputeService {
  /**
   * Checks if there is an active or recently resolved dispute
   * linked to this booking. Returns:
   *  - hold: true → payout should not proceed
   *  - adjustment: true → payout should deduct refund amount
   *
   * @param {ObjectId} bookingId
   * @returns {Object|null}
   */
  static async checkDisputeStatus(bookingId) {
    try {
      // 1️⃣ Fetch most recent dispute for this booking
      const dispute = await Dispute.findOne({
        bookingId,
      }).sort({ createdAt: -1 });

      if (!dispute) {
        return null; // no dispute — payout can proceed
      }

      // 2️⃣ If dispute is still open or under review → HOLD payout
      if (["open", "under_review"].includes(dispute.status)) {
        console.log(`⚠️ Dispute open for booking ${bookingId} → Payout on hold.`);
        return { hold: true, _id: dispute._id };
      }

      // 3️⃣ If dispute resolved → decide refund adjustments
      if (dispute.status === "resolved" && dispute.decision) {
        const { refundAmount = 0, tipRefundAmount = 0, outcome } = dispute.decision;

        // If full refund → block payout completely
        if (outcome === "refund_full") {
          console.log(`⛔ Full refund issued → block payout for booking ${bookingId}.`);
          return {
            hold: true,
            adjustment: false,
            reason: "Full refund",
            decision: dispute.decision,
            _id: dispute._id,
          };
        }

        // If partial refund → allow payout but adjust
        if (outcome === "refund_partial" && refundAmount > 0) {
          console.log(`💰 Partial refund detected → adjust payout for booking ${bookingId}.`);
          return {
            hold: false,
            adjustment: true,
            decision: dispute.decision,
            _id: dispute._id,
          };
        }

        // If no refund → payout proceeds normally
        if (outcome === "no_refund") {
          console.log(`✅ Dispute resolved with no refund → payout allowed.`);
          return {
            hold: false,
            adjustment: false,
            decision: dispute.decision,
            _id: dispute._id,
          };
        }
      }

      return null;
    } catch (err) {
      console.error("❌ Dispute check error:", err);
      return null;
    }
  }

  /**
   * Marks a dispute as "linked to payout" (for audit correlation)
   * Used when a payout was blocked or adjusted due to dispute.
   */
  static async linkDisputeToPayout(disputeId, payoutId) {
    try {
      await Dispute.findByIdAndUpdate(disputeId, {
        $set: { "metadata.linkedPayoutId": payoutId },
      });
      console.log(`🔗 Linked dispute ${disputeId} → payout ${payoutId}`);
    } catch (err) {
      console.error("❌ Failed to link dispute to payout:", err);
    }
  }

  /**
   * Gets all disputes currently holding payouts (for admin monitoring).
   */
  static async getActiveDisputesOnHold() {
    const disputes = await Dispute.find({
      status: { $in: ["open", "under_review"] },
    }).select("bookingId providerId reason createdAt");

    return disputes;
  }
}

module.exports = DisputeService;
