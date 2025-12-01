// payout/services/tipService.js
/**
 * CrownStandard Tip Service
 * -----------------------------------------------------
 * Handles retrieval, validation, and lifecycle updates
 * for tip transactions linked to bookings and payouts.
 */

const TipTransaction = require("../../models/TipTransaction");
const AuditLogService = require("./auditLogService");

class TipService {
  /**
   * Fetch all tips eligible for payout for a specific provider.
   * Tips must be succeeded, unreleased, and have no active dispute.
   */
  static async getEligibleTips(providerId, limit = 100) {
    try {
      return TipTransaction.find({
        providerId,
        status: "succeeded",
        payoutStatus: "not_initiated",
        disputeStatus: "none",
      })
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean()
        .exec();
    } catch (err) {
      console.error("❌ TipService.getEligibleTips:", err.message);
      await AuditLogService.logError(err, "TipService.getEligibleTips", { providerId });
      throw err;
    }
  }

  /**
   * Fetch all tips for a booking that are ready to merge into payout.
   */
  static async getTipForBooking(bookingId) {
    try {
      return TipTransaction.findOne({
        bookingId,
        status: "succeeded",
        payoutStatus: "not_initiated",
        disputeStatus: "none",
      })
        .lean()
        .exec();
    } catch (err) {
      console.error("❌ TipService.getTipForBooking:", err.message);
      await AuditLogService.logError(err, "TipService.getTipForBooking", { bookingId });
      throw err;
    }
  }

  /**
   * Mark a tip as scheduled for payout (used when payout record created).
   */
  static async markAsScheduled(tipId, payoutId) {
    try {
      const tip = await TipTransaction.findById(tipId);
      if (!tip) throw new Error("Internal: Tip transaction not found");

      tip.payoutStatus = "scheduled";
      tip.payoutRefId = payoutId;
      await tip.save();

      await AuditLogService.logSystemAction(
        "PAYOUT_SCHEDULED", // 🔸 changed for clarity
        "tip",
        tip._id,
        "Tip marked as scheduled for payout",
        { payoutId }
      );

      return tip;
    } catch (err) {
      console.error("❌ TipService.markAsScheduled:", err.message);
      await AuditLogService.logError(err, "TipService.markAsScheduled", { tipId, payoutId });
      throw err;
    }
  }

  /**
   * Mark a tip as successfully released (Stripe transfer done).
   */
  static async markAsReleased(tipId, stripeTransferId) {
    try {
      const tip = await TipTransaction.findById(tipId);
      if (!tip) throw new Error("Internal: Tip transaction not found");

      tip.payoutStatus = "released";
      tip.stripeTransferId = stripeTransferId; // 🔸 renamed for consistency
      tip.releasedAt = new Date();
      await tip.save();

      await AuditLogService.logSystemAction(
        "PAYOUT_RELEASED",
        "tip",
        tip._id,
        "Tip payout released successfully",
        { stripeTransferId }
      );

      return tip;
    } catch (err) {
      console.error("❌ TipService.markAsReleased:", err.message);
      await AuditLogService.logError(err, "TipService.markAsReleased", { tipId });
      throw err;
    }
  }

  /**
   * Mark tip as failed or cancelled (on payout error or dispute).
   */
  static async markAsFailed(tipId, reason = "Unknown error") {
    try {
      const tip = await TipTransaction.findById(tipId);
      if (!tip) throw new Error("Internal: Tip transaction not found");

      tip.payoutStatus = "failed";
      tip.holdReason = reason;
      await tip.save();

      await AuditLogService.logSystemAction(
        "PAYOUT_HELD",
        "tip",
        tip._id,
        "Tip payout failed or on hold",
        { reason }
      );

      return tip;
    } catch (err) {
      console.error("❌ TipService.markAsFailed:", err.message);
      await AuditLogService.logError(err, "TipService.markAsFailed", { tipId, reason });
      throw err;
    }
  }

  /**
   * Calculate total tips for a provider (for analytics / dashboard).
   */
  static async calculateTotalTips(providerId) {
    const tips = await TipTransaction.aggregate([
      { $match: { providerId, status: "succeeded" } },
      {
        $group: {
          _id: "$currency",
          totalTips: { $sum: "$amount" },
        },
      },
    ]);

    if (!tips.length) return { totalTips: 0, currency: "CAD" };
    return { totalTips: tips[0].totalTips, currency: tips[0]._id };
  }
}

module.exports = TipService;
