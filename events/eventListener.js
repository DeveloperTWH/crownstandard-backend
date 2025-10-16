// events/eventListener.js
const AWS = require("aws-sdk");
const { payoutWorker } = require("../workers/payoutWorker");
const { retryWorker } = require("../workers/retryWorker");

const sqs = new AWS.SQS({ region: process.env.AWS_REGION || "us-east-1" });

const QUEUE_URL = process.env.PAYOUT_EVENTS_QUEUE_URL;

/**
 * Poll messages from SQS (subscribed to EventBridge)
 * and dispatch to appropriate worker
 */
async function pollEvents() {
  try {
    const params = {
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20, // Long polling
    };

    const data = await sqs.receiveMessage(params).promise();

    if (!data.Messages || data.Messages.length === 0) return;

    for (const message of data.Messages) {
      try {
        const body = JSON.parse(message.Body);
        // EventBridge event might be wrapped; adjust accordingly
        const eventDetail = body.detail || body;

        // Dispatch based on event type
        switch (body["detail-type"]) {
          case "PAYOUT_RELEASED":
          case "PAYOUT_FAILED":
          case "PAYOUT_SCHEDULED":
            await payoutWorker(eventDetail);
            break;
          case "PAYOUT_RETRY":
            await retryWorker(eventDetail);
            break;
          default:
            console.warn("Unknown event type:", body["detail-type"]);
        }

        // Delete message after successful processing
        await sqs
          .deleteMessage({ QueueUrl: QUEUE_URL, ReceiptHandle: message.ReceiptHandle })
          .promise();
      } catch (err) {
        console.error("Error processing SQS message:", err, message.Body);
        // Optional: Move to DLQ for manual inspection
      }
    }
  } catch (err) {
    console.error("Error polling SQS messages:", err);
  }
}

module.exports = {
  pollEvents,
};
