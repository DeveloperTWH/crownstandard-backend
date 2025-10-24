/**
 * /payout/events/eventPublisher.js
 * ---------------------------------------------------------------
 * Handles publishing domain events to AWS EventBridge.
 * Used across payout module for PAYOUT_* lifecycle events.
 * ---------------------------------------------------------------
 */

const AWS = require("aws-sdk");
const eventBridge = new AWS.EventBridge({ region: process.env.AWS_REGION });

class EventPublisher {
  /**
   * Publishes a custom event to EventBridge for observability & downstream triggers.
   *
   * @param {String} eventType - e.g., "PAYOUT_SCHEDULED", "PAYOUT_RELEASED"
   * @param {Object} payload - event detail object
   */
  static async publishEvent(eventType, payload = {}) {
    try {
      if (!eventType) throw new Error("Event type is required");

      const event = {
        Entries: [
          {
            Source: "crownstandard.payout",
            DetailType: eventType,
            Detail: JSON.stringify({
              ...payload,
              timestamp: new Date().toISOString(),
            }),
            EventBusName: process.env.EVENT_BUS_NAME || "default",
          },
        ],
      };

      const response = await eventBridge.putEvents(event).promise();

      if (response.FailedEntryCount > 0) {
        console.error("⚠️ EventBridge publish partially failed:", response);
      } else {
        console.log(`📡 Event published → ${eventType}`);
      }
    } catch (err) {
      console.error("❌ Failed to publish EventBridge event:", err.message);
    }
  }
}

module.exports = {
  publishEvent: EventPublisher.publishEvent.bind(EventPublisher),
};
