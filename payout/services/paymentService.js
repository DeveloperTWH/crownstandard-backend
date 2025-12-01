// payout/services/paymentService.js
/**
 * CrownStandard Payment Service
 * -----------------------------------------------------
 * Responsible for verifying and managing payment transactions
 * used in payout computation.
 * Integrates with Stripe through paymentIntent references.
 */

const PaymentTransaction = require("../../models/PaymentTransaction");
const AuditLogService = require("./auditLogService");

class PaymentService {
  /**
   * Fetch and validate payment transaction for a booking.
   * Ensures the payment is successful and eligible for payout.
   * @param {ObjectId} bookingId
   * @returns {Promise<Object>} PaymentTransaction document
   */
  static async getValidPaymentTransaction(bookingId) {
    try {
      const paymentTx = await PaymentTransaction.findOne({ bookingId });

      if (!paymentTx) {
        throw new Error("Internal: No payment transaction found for booking");
      }

      if (paymentTx.status !== "succeeded") {
        throw new Error(`Internal: Payment not succeeded (current: ${paymentTx.status})`);
      }

      if (paymentTx.transferStatus === "transferred") {
        throw new Error("Internal: Payment already transferred to provider");
      }

      return paymentTx;
    } catch (err) {
      console.error("❌ PaymentService.getValidPaymentTransaction:", err.message);
      await AuditLogService.logError(err, "PaymentService.getValidPaymentTransaction", {
        bookingId,
      });
      throw err;
    }
  }

  /**
   * Calculate net payable amount after considering refunds.
   * @param {Object} paymentTx - PaymentTransaction document
   * @returns {{netAmount: number, refundedAmount: number, currency: string}}
   */
  static calculateNetPayable(paymentTx) {
    const refunded = Number(paymentTx.refundedAmount || 0);
    const netAmount = Math.max(Number(paymentTx.transferAmount || 0) - refunded, 0);

    return {
      netAmount: Number(netAmount.toFixed(2)),
      refundedAmount: refunded,
      currency: paymentTx.currency,
    };
  }

  /**
   * Mark a payment transaction as refunded (partial or full).
   * Automatically logs refund action for audit traceability.
   * @param {String} paymentIntentId
   * @param {Number} refundedAmount
   * @param {String} [reason]
   */
  static async markRefund(paymentIntentId, refundedAmount, reason = "N/A") {
    try {
      const paymentTx = await PaymentTransaction.findOne({ paymentIntentId });
      if (!paymentTx) throw new Error("Internal: Payment transaction not found");

      // ✅ Prevent over-refund
      if (refundedAmount > paymentTx.amount) {
        refundedAmount = paymentTx.amount;
      }

      const newStatus =
        refundedAmount >= paymentTx.amount ? "refunded" : "partial_refunded";

      await PaymentTransaction.updateOne(
        { _id: paymentTx._id },
        {
          $set: {
            status: newStatus,
            refundedAmount,
            refundedAt: new Date(),
          },
        }
      );

      await AuditLogService.logSystemAction(
        "REFUND_ISSUED",
        "payment",
        paymentTx._id,
        `Refund issued for PaymentIntent ${paymentIntentId}`,
        {
          refundedAmount,
          reason,
          currency: paymentTx.currency,
          previousStatus: paymentTx.status,
          newStatus,
        }
      );

      return { success: true, refundedAmount };
    } catch (err) {
      console.error("❌ PaymentService.markRefund failed:", err.message);
      await AuditLogService.logError(err, "PaymentService.markRefund", {
        paymentIntentId,
        refundedAmount,
      });
      throw err;
    }
  }

  /**
   * Mark payment as transferred once payout succeeds.
   * @param {ObjectId} paymentTxId
   * @param {String} stripeTransferId - Stripe transfer ID
   */
  static async markTransferred(paymentTxId, stripeTransferId) {
    try {
      const paymentTx = await PaymentTransaction.findById(paymentTxId);
      if (!paymentTx) throw new Error("Internal: Payment transaction not found");

      paymentTx.transferStatus = "transferred";
      paymentTx.stripeTransferId = stripeTransferId; // 🔸 renamed for clarity
      await paymentTx.save();

      await AuditLogService.logSystemAction(
        "PAYMENT_TRANSFERRED", // 🔸 more accurate than PAYOUT_RELEASED
        "payment",
        paymentTx._id,
        `Payment marked as transferred`,
        { stripeTransferId }
      );

      return paymentTx;
    } catch (err) {
      console.error("❌ PaymentService.markTransferred:", err.message);
      await AuditLogService.logError(err, "PaymentService.markTransferred", {
        paymentTxId,
        stripeTransferId,
      });
      throw err;
    }
  }

  /**
   * Retrieve all payments pending transfer (for payout worker).
   * @returns {Promise<Array>}
   */
  static async getPendingTransfers(limit = 50) {
    return PaymentTransaction.find({
      status: "succeeded",
      transferStatus: { $in: ["not_initiated", "scheduled"] },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean()
      .exec();
  }
}

module.exports = PaymentService;
