// payout/workers/payoutWorker.js
/**
 * CrownStandard Payout Worker
 * -----------------------------------------------------
 * Executes Stripe transfers for all scheduled payouts.
 * Ensures idempotency, retry safety, and audit traceability.
 */

const Payout = require("../../models/Payout");
const Booking = require("../../models/Booking");
const PaymentService = require("../services/paymentService");
const TipService = require("../services/tipService");
const StripeUtils = require("../utils/stripeUtils");
const AuditLogService = require("../services/auditLogService");
const PayoutService = require("../services/payoutService");
const { EventEmitter } = require("events");

const eventBus = new EventEmitter();

class PayoutWorker {
  /**
   * Process all eligible payouts (status = 'scheduled' or 'processing')
   * @param {Number} [limit=20]
   */
  static async processScheduledPayouts(limit = 20) {
    const eligiblePayouts = await Payout.find({
      status: { $in: ["scheduled", "processing"] },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    if (!eligiblePayouts.length) {
      console.log("ℹ️ No scheduled payouts found.");
      return;
    }

    console.log(`🚀 Processing ${eligiblePayouts.length} scheduled payouts...`);

    for (const payout of eligiblePayouts) {
      try {
        await this.processSinglePayout(payout);
      } catch (err) {
        console.error(`❌ Error processing payout ${payout._id}:`, err.message);
        await AuditLogService.logError(err, "PayoutWorker.processSinglePayout", {
          payoutId: payout._id,
        });
        // Ensure failure state is visible for retryWorker
        await PayoutService.markAsFailed(payout._id, err.message);
      }
    }

    console.log("✅ Payout batch processing complete.");
  }

  /**
   * Process a single payout safely
   * @param {Object} payout
   */
  static async processSinglePayout(payout) {
    console.log(`💸 Processing payout: ${payout._id}`);

    if (!payout.amount || payout.amount <= 0) {
      console.warn(`⚠️ Skipping payout ${payout._id} — zero amount.`);
      await PayoutService.markAsFailed(payout._id, "Zero payout amount");
      return;
    }

    const providerId = payout.providerId;
    const destination = await this.getProviderStripeAccount(providerId);
    if (!destination) {
      throw new Error(`Provider ${providerId} missing Stripe account ID`);
    }

    // Verify Stripe account eligibility
    const verified = await StripeUtils.verifyConnectedAccount(destination);
    if (!verified) {
      await PayoutService.markAsFailed(payout._id, "Provider Stripe account not verified");
      return;
    }

    // Mark as processing before attempting transfer
    await Payout.updateOne({ _id: payout._id }, { status: "processing" });

    try {
      // Execute Stripe transfer (Stripe expects amount in cents)
      const transfer = await StripeUtils.createTransfer({
        amount: Math.round(payout.amount * 100), // ✅ cents
        currency: payout.currency,
        destination,
        idempotencyKey: payout.idempotencyKey,
        payoutId: payout._id,
        providerId: payout.providerId,
      });

      // Mark payout as transferred
      await PayoutService.markAsTransferred(payout._id, transfer.id);

      // Update payment & tip transactions
      if (payout.paymentTransactionId) {
        await PaymentService.markTransferred(payout.paymentTransactionId, transfer.id);
      }

      if (payout.tipTransactionId) {
        await TipService.markAsReleased(payout.tipTransactionId, transfer.id);
      }

      // Update booking payout info
      await Booking.updateOne(
        { _id: payout.bookingId },
        {
          $set: {
            "payout.status": "released",
            "payout.transferId": transfer.id,
            "payout.releasedAt": new Date(),
          },
        }
      );

      // Log + Emit
      await AuditLogService.logSystemAction(
        "PAYOUT_RELEASED",
        "payout",
        payout._id,
        `Payout ${payout._id} released successfully.`,
        { stripeTransferId: transfer.id }
      );

      eventBus.emit("PAYOUT_RELEASED", {
        payoutId: payout._id,
        stripeTransferId: transfer.id,
        providerId: payout.providerId,
      });

      console.log(`✅ Payout ${payout._id} released successfully.`);
    } catch (err) {
      console.error(`❌ Transfer failed for payout ${payout._id}:`, err.message);
      await PayoutService.markAsFailed(payout._id, err.message);
      throw err;
    }
  }

  /**
   * Retrieve provider’s Stripe account ID
   * Replace this stub with actual DB lookup in production.
   */
  static async getProviderStripeAccount(providerId) {
    console.log(`Fetching Stripe account ID for provider: ${providerId}`);
    // Example for production:
    // const provider = await User.findById(providerId).select("stripeAccountId");
    // return provider?.stripeAccountId || null;
    return process.env.TEST_STRIPE_ACCOUNT_ID || null;
  }
}

module.exports = PayoutWorker;
