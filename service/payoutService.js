// services/payoutService.js
const Booking = require("../models/Booking");
const Payout = require("../models/Payout");
const TipTransaction = require("../models/TipTransaction");
const PaymentTransaction = require("../models/PaymentTransaction");
const Dispute = require("../models/Dispute");
const AuditLog = require("../models/AuditLog");
const { publishEvent } = require("../events/eventPublisher");
const { logAudit } = require("../utils/auditLogger");
const { calculateTotalPayoutAmount } = require("../utils/currencyHelper");

class PayoutService {
  /**
   * Create a payout for a booking (includes tip if any)
   * @param {String} bookingId
   * @param {String} adminId
   */
  static async createPayoutForBooking(bookingId, adminId) {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new Error("Booking not found");

    // Check dispute: if open, don't release payout yet
    if (booking.disputeStatus === "open") {
      return null; // payout on hold
    }

    // Get payment and tip details
    const payment = await PaymentTransaction.findOne({ bookingId });
    if (!payment || payment.status !== "succeeded") {
      throw new Error("Payment not completed");
    }

    const tip = await TipTransaction.findOne({ bookingId, status: "succeeded" });

    // Calculate total payout
    const totalAmount = calculateTotalPayoutAmount(booking, tip);

    // Create payout document
    const payout = await Payout.create({
      providerId: booking.providerId,
      bookingId: booking._id,
      paymentTransactionId: payment._id,
      tipTransactionId: tip?._id,
      amount: totalAmount,
      currency: booking.pricingSnapshot.currency,
      status: "scheduled",
      payoutType: "booking",
      idempotencyKey: `payout_${booking._id}_${Date.now()}`,
    });

    // Audit log
    await logAudit({
      performedBy: adminId,
      actionType: "PAYOUT_RELEASED",
      targetType: "payout",
      targetId: payout._id,
      description: `Payout scheduled for booking ${bookingId}`,
      before: null,
      after: payout.toObject(),
    });

    // Publish event
    publishEvent("payout_scheduled", { payoutId: payout._id });

    return payout;
  }

  /**
   * Execute the payout (transfer money to provider)
   * @param {Object} payout
   */
  static async executePayout(payout) {
    try {
      // Call payment gateway here (Stripe, etc.)
      // Example: await stripe.transfers.create({...})
      const transferResult = { id: "tr_12345", success: true }; // mock

      if (!transferResult.success) {
        throw new Error("Transfer failed");
      }

      payout.status = "transferred";
      payout.transferredAt = new Date();
      payout.stripeTransferId = transferResult.id;
      await payout.save();

      // Update Booking payout status
      await Booking.findByIdAndUpdate(payout.bookingId, {
        "payout.status": "released",
        "payout.releasedAt": new Date(),
      });

      // Update Tip payout status if tip exists
      if (payout.tipTransactionId) {
        await TipTransaction.findByIdAndUpdate(payout.tipTransactionId, {
          payoutStatus: "released",
          releasedAt: new Date(),
        });
      }

      // Audit log
      await logAudit({
        performedBy: null,
        actionType: "PAYOUT_RELEASED",
        targetType: "payout",
        targetId: payout._id,
        description: "Payout executed successfully",
        before: null,
        after: payout.toObject(),
      });

      publishEvent("payout_completed", { payoutId: payout._id });
    } catch (error) {
      console.error("Payout execution failed:", error.message);

      payout.status = "failed";
      payout.failureReason = error.message;
      payout.attempts += 1;
      await payout.save();

      // Audit log
      await logAudit({
        performedBy: null,
        actionType: "PAYOUT_HELD",
        targetType: "payout",
        targetId: payout._id,
        description: `Payout failed: ${error.message}`,
        before: null,
        after: payout.toObject(),
      });

      publishEvent("payout_failed", { payoutId: payout._id, error: error.message });

      // Retry logic will be handled by worker
    }
  }

  /**
   * Retry failed payouts (called by retry worker)
   */
  static async retryFailedPayouts() {
    const failedPayouts = await Payout.find({ status: "failed", attempts: { $lt: 3 } });
    for (const payout of failedPayouts) {
      await this.executePayout(payout);
    }
  }
}

module.exports = PayoutService;
