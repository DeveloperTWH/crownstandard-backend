// payout/utils/stripeUtils.js
/**
 * CrownStandard Stripe Utilities
 * -----------------------------------------------------
 * Handles all payout-related Stripe operations:
 *  - Creating provider transfers (Stripe Connect)
 *  - Enforcing idempotency for retry safety
 *  - Logging results to the audit system
 */

const Stripe = require("stripe");
const AuditLogService = require("../services/auditLogService");
require("dotenv").config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16", // ✅ Lock API version for stability
});

const StripeUtils = {
  /**
   * Create a Stripe Connect transfer to a provider account.
   * @param {Object} params
   * @param {Number} params.amount - Amount to transfer (in **cents**, integer)
   * @param {String} params.currency - e.g., "CAD"
   * @param {String} params.destination - Provider's Stripe account ID (acct_xxx)
   * @param {String} params.idempotencyKey - unique idempotency key for the transfer
   * @param {ObjectId} params.payoutId - Payout reference for audit logging
   * @param {ObjectId} params.providerId - Provider reference for audit logging
   * @returns {Promise<Object>} Stripe transfer response
   */
  async createTransfer({ amount, currency, destination, idempotencyKey, payoutId, providerId }) {
    try {
      if (!amount || amount <= 0 || !destination) {
        throw new Error("Invalid Stripe transfer parameters");
      }

      // Stripe expects integer amounts (already in cents)
      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: currency.toLowerCase(),
          destination,
          description: `CrownStandard payout for provider ${providerId}`,
          metadata: {
            providerId: providerId?.toString(),
            payoutId: payoutId?.toString(),
            environment: process.env.NODE_ENV || "development",
          },
        },
        {
          idempotencyKey,
        }
      );

      // ✅ Audit log
      await AuditLogService.logSystemAction(
        "PAYOUT_RELEASED",
        "payout",
        payoutId,
        `Stripe transfer succeeded: ${transfer.id}`,
        { transferId: transfer.id, amount, currency, providerId }
      );

      return transfer;
    } catch (err) {
      console.error("❌ StripeUtils.createTransfer:", err.message);

      // Log failure without breaking the payout service
      await AuditLogService.logError(err, "StripeUtils.createTransfer", {
        payoutId,
        providerId,
        amount,
        currency,
      });

      throw err;
    }
  },

  /**
   * Retrieve an existing Stripe transfer (for reconciliation).
   * @param {String} transferId
   * @returns {Promise<Object|null>}
   */
  async retrieveTransfer(transferId) {
    try {
      const transfer = await stripe.transfers.retrieve(transferId);
      return transfer;
    } catch (err) {
      console.error("❌ StripeUtils.retrieveTransfer:", err.message);
      await AuditLogService.logError(err, "StripeUtils.retrieveTransfer", { transferId });
      return null;
    }
  },

  /**
   * Reverse a Stripe transfer (for refund or admin rollback).
   * @param {String} transferId
   * @param {Number} amount - optional (in **cents**, integer)
   * @param {String} reason
   */
  async reverseTransfer(transferId, amount, reason = "Refund or adjustment") {
    try {
      const reversal = await stripe.transfers.createReversal(transferId, {
        amount: amount && amount > 0 ? amount : undefined,
        metadata: { reason },
      });

      await AuditLogService.logSystemAction(
        "REFUND_ISSUED",
        "payout",
        transferId,
        `Stripe transfer reversed`,
        { amount, reason }
      );

      return reversal;
    } catch (err) {
      console.error("❌ StripeUtils.reverseTransfer:", err.message);
      await AuditLogService.logError(err, "StripeUtils.reverseTransfer", {
        transferId,
        amount,
        reason,
      });
      throw err;
    }
  },

  /**
   * Verify a provider’s Stripe account connection before payout.
   * @param {String} stripeAccountId
   * @returns {Promise<Boolean>}
   */
  async verifyConnectedAccount(stripeAccountId) {
    try {
      const account = await stripe.accounts.retrieve(stripeAccountId);
      const isVerified =
        account.details_submitted &&
        account.charges_enabled &&
        account.payouts_enabled;

      return !!isVerified;
    } catch (err) {
      console.error("❌ StripeUtils.verifyConnectedAccount:", err.message);
      await AuditLogService.logError(err, "StripeUtils.verifyConnectedAccount", {
        stripeAccountId,
      });
      return false;
    }
  },
};

module.exports = StripeUtils;
