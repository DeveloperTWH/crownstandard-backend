// payoutPublisher.js

const AWS = require("aws-sdk");

// configure EventBridge
const eventBridge = new AWS.EventBridge({ region: process.env.AWS_REGION || "us-east-1" });

/**
 * Publish payout event to EventBridge
 * @param {Object} payout - Payout document
 */
async function publishPayoutEvent(payout) {
  const params = {
    Entries: [
      {
        Source: "myapp.payout",
        EventBusName: process.env.PAYOUT_EVENT_BUS || "default",
        DetailType: "PAYOUT_SCHEDULED",
        Time: new Date(),
        Detail: JSON.stringify({
          payoutId: payout._id,
          bookingId: payout.bookingId,
          providerId: payout.providerId,
          amount: payout.amount,
          currency: payout.currency,
          payoutType: payout.payoutType,
          releaseDate: payout.releaseDate,
          metadata: payout.metadata
        }),
      },
    ],
  };

  try {
    const result = await eventBridge.putEvents(params).promise();
    console.log("Payout event published:", result);
    return result;
  } catch (err) {
    console.error("Failed to publish payout event:", err);
    throw err;
  }
}

module.exports = { publishPayoutEvent };
