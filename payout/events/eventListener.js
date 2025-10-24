/**
 * /payout/events/eventListener.js
 * ---------------------------------------------------------------
 * Listens for relevant domain events from EventBridge or
 * internal microservices and enqueues payout jobs to SQS.
 * ---------------------------------------------------------------
 */

const AWS = require("aws-sdk");
const BookingService = require("../service/bookingService");
const { logAudit } = require("../utils/auditLogger");

const sqs = new AWS.SQS({ region: process.env.AWS_REGION });
const QUEUE_URL = process.env.PAYOUT_QUEUE_URL;

class EventListener {
  /**
   * Handles incoming "BookingCompleted" event.
   * Triggers payout eligibility flow after 48-hour window.
   */
  static async handleBookingCompleted(event) {
    try {
      const { bookingId } = event.detail;
      if (!bookingId) throw new Error("Missing bookingId in event payload.");

      console.log(`🎉 BookingCompleted event received → ${bookingId}`);

      // Fetch booking and confirm completion
      const booking = await BookingService.getBookingIfEligible(bookingId);
      if (!booking) {
        console.log(`⏸️ Booking ${bookingId} not yet eligible for payout.`);
        return;
      }

      // Push message to SQS for payout processing
      await sqs
        .sendMessage({
          QueueUrl: QUEUE_URL,
          MessageBody: JSON.stringify({ bookingId }),
          MessageGroupId: "payout-group", // for FIFO queues (optional)
          MessageDeduplicationId: `payout-${bookingId}`,
        })
        .promise();

      console.log(`📤 Payout job queued for booking ${bookingId}`);

      // Audit log
      await logAudit({
        actionType: "PAYOUT_SCHEDULED",
        targetType: "booking",
        targetId: bookingId,
        description: "Payout job scheduled after booking completion event.",
      });
    } catch (err) {
      console.error("❌ Error handling BookingCompleted event:", err.message);
    }
  }

  /**
   * Handles "DisputeResolved" event.
   * If dispute resolved (no refund or partial), re-queues payout job.
   */
  static async handleDisputeResolved(event) {
    try {
      const { bookingId, outcome } = event.detail;
      if (!bookingId) throw new Error("Missing bookingId in dispute event.");

      console.log(`⚖️ DisputeResolved event → ${bookingId} (${outcome})`);

      // Only re-trigger payout if payout can now proceed
      if (["no_refund", "refund_partial"].includes(outcome)) {
        await sqs
          .sendMessage({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify({ bookingId }),
            MessageGroupId: "payout-group",
            MessageDeduplicationId: `dispute-${bookingId}`,
          })
          .promise();

        console.log(`📤 Re-queued payout for booking ${bookingId} after dispute resolution.`);

        await logAudit({
          actionType: "DISPUTE_RESOLVED",
          targetType: "dispute",
          targetId: bookingId,
          description: `Dispute resolved with outcome: ${outcome}. Payout re-scheduled.`,
        });
      } else {
        console.log(`🚫 Dispute outcome (${outcome}) blocks payout for booking ${bookingId}.`);
      }
    } catch (err) {
      console.error("❌ Error handling DisputeResolved event:", err.message);
    }
  }

  /**
   * Dispatch entry — routes incoming events to correct handler.
   * @param {Object} event - raw EventBridge payload
   */
  static async dispatch(event) {
    try {
      const type = event["detail-type"] || event.detailType;

      switch (type) {
        case "BookingCompleted":
          await this.handleBookingCompleted(event);
          break;

        case "DisputeResolved":
          await this.handleDisputeResolved(event);
          break;

        default:
          console.log(`ℹ️ Ignored event type: ${type}`);
      }
    } catch (err) {
      console.error("❌ Event dispatch error:", err);
    }
  }
}

module.exports = EventListener;
