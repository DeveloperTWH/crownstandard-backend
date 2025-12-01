// payout/services/disputeService.js
/**
 * CrownStandard Dispute Service
 * -----------------------------------------------------
 * Manages dispute status, refund resolution, and payout hold/release rules.
 */

const mongoose = require("mongoose");
const Dispute = require("../../models/Dispute");
const Booking = require("../../models/Booking");
const PaymentTransaction = require("../../models/PaymentTransaction");
const TipTransaction = require("../../models/TipTransaction");
const AuditLogService = require("./auditLogService");

class DisputeService {
  /**
   * Check if a booking is under dispute.
   */
  static async isBookingUnderDispute(bookingId) {
    const dispute = await Dispute.findOne({
      bookingId,
      status: { $in: ["open", "under_review"] },
    }).lean();
    return !!dispute;
  }

  /**
   * Retrieve all active disputes for a provider.
   */
  static async getActiveDisputes(providerId) {
    return Dispute.find({
      providerId,
      status: { $in: ["open", "under_review"] },
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  /**
   * Resolve a dispute with an admin decision.
   * Handles refunds and updates payout eligibility accordingly.
   */
  static async resolveDispute(disputeId, decision, adminId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const dispute = await Dispute.findById(disputeId).session(session);
      if (!dispute) throw new Error("Internal: Dispute not found");
      if (dispute.status === "resolved") throw new Error("Internal: Dispute already resolved");

      // Update dispute details
      dispute.status = "resolved";
      dispute.decision = decision;
      dispute.resolvedBy = adminId;
      dispute.resolvedAt = new Date();
      dispute.refundStatus = "pending";

      // 💸 Handle Payment Refund
      if (decision.refundAmount > 0 && dispute.paymentTransactionId) {
        const paymentTx = await PaymentTransaction.findById(dispute.paymentTransactionId).session(session);
        if (paymentTx) {
          const refundAmount = Math.min(decision.refundAmount, paymentTx.amount);
          paymentTx.status = refundAmount >= paymentTx.amount ? "refunded" : "partial_refunded";
          paymentTx.refundedAmount = refundAmount;
          paymentTx.refundedAt = new Date();
          await paymentTx.save({ session });
        }
      }

      // 💰 Handle Tip Refund
      if (decision.tipRefundAmount > 0 && dispute.tipTransactionId) {
        const tipTx = await TipTransaction.findById(dispute.tipTransactionId).session(session);
        if (tipTx) {
          const refundAmount = Math.min(decision.tipRefundAmount, tipTx.amount);
          tipTx.status = refundAmount >= tipTx.amount ? "refunded" : "partial_refunded";
          tipTx.refundedAmount = refundAmount;
          tipTx.refundedAt = new Date();
          await tipTx.save({ session });
        }
      }

      // 🧾 Mark refunds processed
      dispute.refundStatus = "processed";
      await dispute.save({ session });

      // 🧩 Update booking dispute status
      const booking = await Booking.findById(dispute.bookingId).session(session);
      if (booking) {
        booking.disputeStatus =
          ["refund_full", "refund_partial"].includes(decision.outcome)
            ? "resolved_refunded"
            : "resolved_rejected";
        await booking.save({ session });
      }

      // 🧠 Audit log
      await AuditLogService.logAction({
        actionType: "DISPUTE_RESOLVED",
        performedBy: adminId,
        targetType: "dispute",
        targetId: dispute._id,
        description: `Dispute resolved with outcome: ${decision.outcome}`,
        meta: {
          refundAmount: decision.refundAmount,
          tipRefundAmount: decision.tipRefundAmount,
          bookingId: dispute.bookingId,
        },
      });

      await session.commitTransaction();
      session.endSession();

      return dispute;
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      console.error("❌ DisputeService.resolveDispute:", err.message);
      await AuditLogService.logError(err, "DisputeService.resolveDispute", { disputeId });
      throw err;
    }
  }

  /**
   * Place payout on hold when a dispute is opened.
   */
  static async holdPayoutForDispute(bookingId, reason = "Dispute opened") {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error("Internal: Booking not found");

      booking.payout.status = "on_hold";
      booking.payout.holdReason = reason;
      await booking.save();

      await AuditLogService.logSystemAction(
        "PAYOUT_HELD",
        "booking",
        booking._id,
        `Payout held due to dispute: ${reason}`,
        { disputeStatus: booking.disputeStatus }
      );

      return booking;
    } catch (err) {
      console.error("❌ DisputeService.holdPayoutForDispute:", err.message);
      await AuditLogService.logError(err, "DisputeService.holdPayoutForDispute", { bookingId });
      throw err;
    }
  }

  /**
   * Re-enable payout after dispute is resolved/rejected.
   */
  static async releasePayoutAfterResolution(bookingId) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error("Internal: Booking not found");

      if (!["resolved_refunded", "resolved_rejected"].includes(booking.disputeStatus)) {
        throw new Error("Internal: Dispute not yet resolved");
      }

      booking.payout.status = "pending";
      booking.payout.holdReason = null;
      await booking.save();

      await AuditLogService.logSystemAction(
        "PAYOUT_RELEASED", // ✅ fixed typo
        "booking",
        booking._id,
        "Payout re-enabled after dispute resolution",
        { disputeStatus: booking.disputeStatus }
      );

      return booking;
    } catch (err) {
      console.error("❌ DisputeService.releasePayoutAfterResolution:", err.message);
      await AuditLogService.logError(err, "DisputeService.releasePayoutAfterResolution", { bookingId });
      throw err;
    }
  }
}

module.exports = DisputeService;
