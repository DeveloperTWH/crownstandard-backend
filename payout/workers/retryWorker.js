// payout/workers/retryWorker.js
/**
 * CrownStandard Retry Worker
 * -----------------------------------------------------
 * Handles retrying failed payouts using exponential backoff strategy.
 * Retries up to 3 times before permanently marking payout as failed.
 */

const Payout = require("../../models/Payout");
const PayoutWorker = require("./payoutWorker");
const AuditLogService = require("../services/auditLogService");

class RetryWorker {
  /**
   * Process all payouts eligible for retry.
   * @param {Number} [limit=10]
   */
  static async processRetryQueue(limit = 10) {
    console.log("heere ia ");
    
    const now = new Date();

    const failedPayouts = await Payout.find({
      status: "failed",
      attempts: { $lt: 3 },
    })
      .sort({ lastFailedAt: 1 })
      .limit(limit)
      .lean();

    if (!failedPayouts.length) {
      console.log("ℹ️ No failed payouts found for retry.");
      return;
    }

    console.log(`🔁 Found ${failedPayouts.length} failed payouts for retry.`);

    for (const payout of failedPayouts) {
      try {
        if (!this.isRetryEligible(payout, now)) {
          console.log(`⏳ Skipping payout ${payout._id} — backoff window not reached yet.`);
          continue;
        }

        await this.retrySinglePayout(payout);
      } catch (err) {
        console.error(`❌ RetryWorker error for payout ${payout._id}:`, err.message);
        await AuditLogService.logError(err, "RetryWorker.retrySinglePayout", {
          payoutId: payout._id,
        });
      }
    }

    console.log("✅ Retry batch processing complete.");
  }

  /**
   * Determine if a payout is ready for retry based on exponential backoff.
   * 1st retry: after 1h
   * 2nd retry: after 6h
   * 3rd retry: after 24h
   * @param {Object} payout
   * @param {Date} now
   * @returns {Boolean}
   */
  static isRetryEligible(payout, now) {
    if (!payout.lastFailedAt) return true;
    const elapsed = now - new Date(payout.lastFailedAt);

    if (payout.attempts === 0) return elapsed >= 0; // immediate
    if (payout.attempts === 1) return elapsed >= 60 * 60 * 1000; // 1h
    if (payout.attempts === 2) return elapsed >= 6 * 60 * 60 * 1000; // 6h
    if (payout.attempts >= 3) return false;

    return true;
  }

  /**
   * Retry a single failed payout.
   * @param {Object} payout
   */
  static async retrySinglePayout(payout) {
    console.log(`🔁 Retrying payout ${payout._id} (attempt ${payout.attempts + 1})`);

    // Update attempt counter and mark as processing
    await Payout.updateOne(
      { _id: payout._id },
      {
        $set: { status: "processing", lastFailedAt: new Date() },
        $inc: { attempts: 1 },
      }
    );

    await AuditLogService.logSystemAction(
      "PAYOUT_RETRY_SCHEDULED",
      "payout",
      payout._id,
      `Retry attempt ${payout.attempts + 1} for failed payout`,
      { attempts: payout.attempts + 1 }
    );

    try {
      await PayoutWorker.processSinglePayout(payout);
    } catch (err) {
      console.error(`❌ Retry failed for payout ${payout._id}:`, err.message);
      await AuditLogService.logError(err, "RetryWorker.retrySinglePayout", {
        payoutId: payout._id,
      });

      // Mark again as failed
      await Payout.updateOne(
        { _id: payout._id },
        {
          $set: {
            status: "failed",
            failureReason: err.message,
            lastFailedAt: new Date(),
          },
        }
      );
    }
  }

  /**
   * Clean up permanently failed payouts (after 3 failed attempts)
   */
  static async markPermanentFailures() {
    const expired = await Payout.updateMany(
      { status: "failed", attempts: { $gte: 3 } },
      { $set: { status: "cancelled" } }
    );

    if (expired.modifiedCount > 0) {
      console.log(`⚠️ ${expired.modifiedCount} payouts marked as permanently failed.`);
    }
  }
}

module.exports = RetryWorker;
