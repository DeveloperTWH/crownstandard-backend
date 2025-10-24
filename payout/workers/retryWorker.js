/**
 * /payout/workers/retryWorker.js
 * ---------------------------------------------------------------
 * Handles automatic retry of failed payouts.
 * Now includes:
 *  - graceful shutdown
 *  - 30-minute auto loop option (for standalone run)
 *  - unified logging
 * ---------------------------------------------------------------
 */

const Payout = require("../../models/Payout");
const PayoutService = require("../service/payoutService");
const BookingService = require("../service/bookingService");
const { logAudit } = require("../utils/auditLogger");
const { updateRetryWorkerHealth } = require("../../routes/healthRoute");


function log(tag, msg) {
  console.log(`[${new Date().toISOString()}][${tag}] ${msg}`);
}

class RetryWorker {
  /** Find failed payouts and re-process them */
  static async processFailedPayouts() {
    log("RETRY", "🔁 Scanning for failed payouts...");

    const failedPayouts = await Payout.find({
      status: "failed",
      attempts: { $lt: 3 },
    })
      .sort({ updatedAt: 1 })
      .limit(10);

    if (failedPayouts.length === 0) {
      log("RETRY", "✅ No failed payouts to retry.");
      updateRetryWorkerHealth("running");
      return;
    }

    for (const payout of failedPayouts) {
      await this.retryPayout(payout);
    }
  }

  /** Retry a single payout with exponential backoff */
  static async retryPayout(payout) {
    try {
      const delayMs = Math.pow(2, payout.attempts) * 60 * 1000; // 1min→2min→4min
      log(
        "RETRY",
        `⚙️ Retrying payout ${payout._id} (booking ${payout.bookingId}) [attempt ${
          payout.attempts + 1
        }] after ${delayMs / 1000}s`
      );

      await new Promise((r) => setTimeout(r, delayMs));

      const booking = await BookingService.getBookingIfEligible(payout.bookingId);
      if (!booking) {
        log("RETRY", `⚠️ Booking ${payout.bookingId} no longer eligible, skipping retry.`);
        return;
      }

      payout.attempts += 1;
      payout.status = "processing";
      await payout.save();

      const result = await PayoutService.createAndReleasePayout(payout.bookingId);

      log(
        "RETRY",
        result.status === "success"
          ? `✅ Retry succeeded for payout ${payout._id}`
          : `❌ Retry failed for payout ${payout._id}: ${result.error}`
      );

      await logAudit({
        actionType: "PAYOUT_RETRIED",
        targetType: "booking",
        targetId: payout.bookingId,
        description: `Retry #${payout.attempts} → ${result.status}`,
        meta: { payoutId: payout._id, error: result.error || null },
      });

      payout.status = result.status === "success" ? "transferred" : "failed";
      payout.failureReason = result.error || null;
      await payout.save();
    } catch (err) {
      log("RETRY", `❌ RetryWorker error: ${err.message}`);
    }
  }

  /** Manual trigger for single payout retry */
  static async retrySinglePayout(payoutId) {
    const payout = await Payout.findById(payoutId);
    if (!payout) {
      log("RETRY", `❌ Payout ${payoutId} not found`);
      return;
    }
    await this.retryPayout(payout);
  }
}

/** Optional: auto-loop every 30 minutes if run directly */
if (require.main === module) {
  (async () => {
    log("RETRY", "🚀 RetryWorker loop started (every 30 minutes)...");
    while (true) {
      await RetryWorker.processFailedPayouts();
      await new Promise((r) => setTimeout(r, 30 * 60 * 1000));
    }
  })();
}

/** Graceful shutdown */
process.on("SIGINT", () => {
  log("RETRY", "🛑 Graceful shutdown (SIGINT)");
  process.exit(0);
});
process.on("SIGTERM", () => {
  log("RETRY", "🛑 Graceful shutdown (SIGTERM)");
  process.exit(0);
});

module.exports = RetryWorker;
