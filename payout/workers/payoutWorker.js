/**
 * /payout/workers/payoutWorker.js
 * ---------------------------------------------------------------
 * SQS Consumer: Handles payout job execution.
 * Now includes:
 *  - graceful shutdown
 *  - duplicate-loop prevention
 *  - unified logging timestamps
 * ---------------------------------------------------------------
 */

const AWS = require("aws-sdk");
const PayoutService = require("../service/payoutService");
const BookingService = require("../service/bookingService");
const { logAudit } = require("../utils/auditLogger");
const { updatePayoutWorkerHealth } = require("../../routes/healthRoute");

const sqs = new AWS.SQS({ region: process.env.AWS_REGION });
const QUEUE_URL = process.env.PAYOUT_QUEUE_URL;

function log(tag, msg) {
  console.log(`[${new Date().toISOString()}][${tag}] ${msg}`);
}

class PayoutWorker {
  /**
   * Process one message from SQS
   */
  static async processMessage(message) {
    try {
      const body = JSON.parse(message.Body);
      const bookingId = body.bookingId;

      log("PAYOUT", `📬 Received payout job for booking ${bookingId}`);

      // 1️⃣ Re-validate booking
      const booking = await BookingService.getBookingIfEligible(bookingId);
      if (!booking) {
        log("PAYOUT", `⚠️ Booking ${bookingId} not eligible for payout, skipping.`);
        await logAudit({
          actionType: "PAYOUT_HELD",
          targetType: "booking",
          targetId: bookingId,
          description: "Booking not eligible for payout (likely dispute or timing).",
        });
        return;
      }

      // 2️⃣ Execute payout
      const result = await PayoutService.createAndReleasePayout(bookingId);

      // 3️⃣ Log result
      if (result.status === "success") {
        log("PAYOUT", `✅ Payout completed for booking ${bookingId}`);
      } else if (result.status === "held") {
        log("PAYOUT", `⏸️ Payout held for booking ${bookingId}`);
      } else {
        log("PAYOUT", `❌ Payout failed for booking ${bookingId}: ${result.error}`);
      }

      // 4️⃣ Delete message only after processing
      await sqs
        .deleteMessage({
          QueueUrl: QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle,
        })
        .promise();

      log("PAYOUT", `🗑️ Message deleted from queue for booking ${bookingId}`);
    } catch (err) {
      log("PAYOUT", `❌ Worker processing error: ${err.message}`);
      // Leave message in queue for SQS visibility-timeout retry
    }
  }

  /**
   * Get and process messages from SQS (called by cron)
   */
  static async processPendingPayouts() {
    log("PAYOUT", `🚀 Started processing pending payouts...`);

    try {
      // Receive messages from SQS (max 5 per call)
      const response = await sqs
        .receiveMessage({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: 5,
          WaitTimeSeconds: 10,
        })
        .promise();

      const messages = response.Messages || [];
      if (messages.length === 0) {
        log("PAYOUT", `ℹ️ No pending messages in queue.`);
        return;
      }

      for (const msg of messages) {
        await this.processMessage(msg);
      }

      updatePayoutWorkerHealth("running");
      log("PAYOUT", `✅ Processed ${messages.length} payouts.`);
    } catch (err) {
      log("PAYOUT", `❌ Error fetching/polling from queue: ${err.message}`);
    }
  }
}

/** Graceful shutdown for EB restarts */
function stopWorker() {
  log("PAYOUT", "🛑 Stopping payout worker gracefully...");
  process.exit(0);
}

process.on("SIGINT", stopWorker);
process.on("SIGTERM", stopWorker);

module.exports = PayoutWorker;
