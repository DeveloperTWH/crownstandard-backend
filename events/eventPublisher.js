// events/eventPublisher.js
const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");

// Initialize EventBridge client
const eventBridge = new EventBridgeClient({ region: process.env.AWS_REGION || "us-east-1" });

/**
 * Publish an event to EventBridge
 * @param {String} source - Source of the event, e.g., 'payout.service'
 * @param {String} detailType - Type of event, e.g., 'PAYOUT_RELEASED'
 * @param {Object} detail - JSON payload of the event
 */
async function publishEvent(source, detailType, detail) {
  try {
    const params = {
      Entries: [
        {
          EventBusName: process.env.EVENT_BUS_NAME || "default",
          Source: source,
          DetailType: detailType,
          Detail: JSON.stringify(detail),
        },
      ],
    };

    const result = await eventBridge.send(new PutEventsCommand(params));
    if (result.FailedEntryCount && result.FailedEntryCount > 0) {
      console.error("EventBridge publish failed for some entries:", result.Entries);
    }
    return result;
  } catch (err) {
    console.error("Error publishing event to EventBridge:", err);
    // Optional: fallback to retry queue (SQS) if EventBridge fails
    throw err;
  }
}

module.exports = {
  publishEvent,
};
