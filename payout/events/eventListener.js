// payout/events/eventListener.js
/**
 * CrownStandard Event Listener
 * -----------------------------------------------------
 * Listens for domain events emitted by EventPublisher.
 * Triggers payout worker, notifications, and other async handlers.
 */

const eventPublisher = require("./eventPublisher");
const PayoutWorker = require("../workers/payoutWorker");
const RetryWorker = require("../workers/retryWorker");
const AuditLogService = require("../services/auditLogService");

class EventListener {
  static init() {
    console.log("🔊 Event listeners initialized for Payout Module.");

    // 1️⃣ Payout scheduled → trigger payout processing
    eventPublisher.on("PAYOUT_SCHEDULED", async (data) => {
      try {
        console.log("⚙️ [Listener] PAYOUT_SCHEDULED:", data);
        await PayoutWorker.processSinglePayout({
          _id: data.payoutId,
          providerId: data.providerId,
          amount: data.amount,
          currency: data.currency,
        });
      } catch (err) {
        console.error("❌ Error handling PAYOUT_SCHEDULED:", err.message);
        await AuditLogService.logError(err, "eventListener.PAYOUT_SCHEDULED", data);
      }
    });

    // 2️⃣ Payout failed → queue for retry
    eventPublisher.on("PAYOUT_FAILED", async (data) => {
      try {
        console.log("⚠️ [Listener] PAYOUT_FAILED:", data);
        await RetryWorker.processRetryQueue();
      } catch (err) {
        console.error("❌ Error handling PAYOUT_FAILED:", err.message);
        await AuditLogService.logError(err, "eventListener.PAYOUT_FAILED", data);
      }
    });

    // 3️⃣ Payout released → notify provider or analytics system
    eventPublisher.on("PAYOUT_RELEASED", async (data) => {
      try {
        console.log("🎉 [Listener] PAYOUT_RELEASED:", data);
        await AuditLogService.logSystemAction(
          "PAYOUT_RELEASED",
          "payout",
          data.payoutId,
          `Payout released successfully.`,
          data
        );
        // (Optional) Send notification or update analytics here
      } catch (err) {
        console.error("❌ Error handling PAYOUT_RELEASED:", err.message);
        await AuditLogService.logError(err, "eventListener.PAYOUT_RELEASED", data);
      }
    });
  }
}

module.exports = EventListener;
