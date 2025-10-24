/**
 * /payout/service/paymentService.js
 * ---------------------------------------------------------------
 * Handles payment validation and refund awareness for payout flow.
 * Ensures that only successful and non-refunded transactions are
 * eligible for provider payouts.
 * ---------------------------------------------------------------
 */

const PaymentTransaction = require("../../models/PaymentTransaction");

class PaymentService {
  /**
   * Validates that a booking's payment was successful and is eligible
   * for payout release.
   *
   * @param {Object} booking - The booking document.
   * @returns {PaymentTransaction|null}
   */
  static async validatePayment(booking) {
    try {
      if (!booking || !booking._id) {
        console.log("⚠️ Missing booking for payment validation");
        return null;
      }

      // 1️⃣ Find the payment transaction linked to this booking
      const paymentTx = await PaymentTransaction.findOne({
        bookingId: booking._id,
        providerId: booking.providerId,
      }).sort({ createdAt: -1 });

      if (!paymentTx) {
        console.log(`⛔ No payment transaction found for booking ${booking._id}`);
        return null;
      }

      // 2️⃣ Ensure payment was successful
      const validStatuses = ["succeeded", "partial_refunded"];
      if (!validStatuses.includes(paymentTx.status)) {
        console.log(
          `⛔ Payment status ${paymentTx.status} not eligible for payout (booking ${booking._id})`
        );
        return null;
      }

      // 3️⃣ Ensure not fully refunded
      const totalPaid = paymentTx.amount || 0;
      const refunded = paymentTx.refundedAmount || 0;

      if (refunded >= totalPaid) {
        console.log(
          `⚠️ Booking ${booking._id} fully refunded — payout not allowed`
        );
        return null;
      }

      // 4️⃣ Validate transfer status is not already done
      if (["transferred", "failed"].includes(paymentTx.transferStatus)) {
        console.log(
          `⚠️ Payment transfer already processed for booking ${booking._id}`
        );
        return null;
      }

      return paymentTx;
    } catch (err) {
      console.error("❌ Payment validation error:", err);
      return null;
    }
  }

  /**
   * Updates the transfer status of a PaymentTransaction
   * after payout execution or retry.
   */
  static async updateTransferStatus(paymentTransactionId, status, transferId = null) {
    try {
      await PaymentTransaction.findByIdAndUpdate(paymentTransactionId, {
        $set: {
          transferStatus: status,
          ...(transferId && { transferId }),
        },
      });
      console.log(`✅ PaymentTransaction ${paymentTransactionId} transfer → ${status}`);
    } catch (err) {
      console.error("❌ Failed to update PaymentTransaction transfer status:", err);
    }
  }

  /**
   * Checks if a refund has been issued post-payment
   * (used for dynamic payout recalculation if disputes occur).
   */
  static async getRefundDetails(paymentTransactionId) {
    try {
      const tx = await PaymentTransaction.findById(paymentTransactionId);
      if (!tx) return null;

      return {
        refundedAmount: tx.refundedAmount || 0,
        refundStatus: tx.status.includes("refunded") ? "refunded" : "none",
      };
    } catch (err) {
      console.error("❌ Failed to get refund details:", err);
      return null;
    }
  }
}

module.exports = PaymentService;
