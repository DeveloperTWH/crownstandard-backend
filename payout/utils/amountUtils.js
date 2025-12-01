// payout/utils/amountUtils.js
/**
 * CrownStandard Amount Utilities
 * -----------------------------------------------------
 * Provides helper functions for calculating provider payouts,
 * tip inclusion, and refund-safe adjustments.
 */

// 🔸 REMOVED: const currencyUtils = require("./currencyUtils");

const AmountUtils = {
  /**
   * Calculates total provider payout (base share + tips - refunds).
   * @param {Object} params
   * @param {Object} params.booking - Booking document
   * @param {Object} params.paymentTx - PaymentTransaction document
   * @param {Object|null} params.tipTx - TipTransaction document (optional)
   * @returns {{ amount: number, currency: string }}
   */
  calculateTotalPayout({ booking, paymentTx, tipTx }) {
    if (!booking || !paymentTx) {
      throw new Error("Invalid booking or payment transaction");
    }

    // 🧮 Step 1: Base provider share (from booking snapshot)
    let providerShare =
      Number(booking?.pricingSnapshot?.providerShare ??
      (paymentTx.transferAmount || 0));

    // 🪙 Step 2: Apply any booking-level refunds
    const refunded = Number(paymentTx.refundedAmount || 0);
    providerShare = Math.max(providerShare - refunded, 0);

    // 💰 Step 3: Add tips (if succeeded & not refunded)
    let totalTip = 0;
    if (tipTx && tipTx.status === "succeeded") {
      totalTip = Math.max(
        Number(tipTx.amount || 0) - Number(tipTx.refundedAmount || 0),
        0
      );
    }

    // 🧾 Step 4: Combine into total payout
    let totalAmount = providerShare + totalTip;
    let currency = booking?.pricingSnapshot?.currency || "CAD";

    // 🔸 Step 5: Stripe handles currency conversion internally.
    // If multiple currencies exist, use the booking currency for consistency.
    if (totalAmount < 0) totalAmount = 0;

    // 🔸 Step 6: Standardize precision
    return {
      amount: Number(totalAmount.toFixed(2)),
      currency,
    };
  },

  /**
   * Compute platform commission based on percentage.
   * @param {Number} total - total payable by customer
   * @param {Number} commissionPercent - commission rate (e.g. 25)
   * @returns {{ providerShare: number, platformCommission: number }}
   */
  computeCommissionSplit(total, commissionPercent = 25) {
    total = Number(total || 0);
    const platformCommission = Number(((total * commissionPercent) / 100).toFixed(2));
    const providerShare = Number((total - platformCommission).toFixed(2));
    return { providerShare, platformCommission };
  },

  /**
   * Ensure no negative payout value.
   * @param {Number} value
   * @returns {Number}
   */
  sanitizeAmount(value) {
    return Math.max(Number(value || 0), 0);
  },

  /**
   * Combine multiple payouts (for analytics or batch summaries).
   * @param {Array<{amount: number}>} payouts
   * @returns {Number}
   */
  sumPayouts(payouts = []) {
    return payouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  },
};

module.exports = AmountUtils;
