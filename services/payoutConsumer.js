// payoutConsumer.js

const AWS = require("aws-sdk");
const Payout = require("./models/Payout");
const AuditLog = require("./models/AuditLog");
const { processStripePayout } = require("./stripeService");

const sqs = new AWS.SQS({ region: process.env.AWS_REGION || "us-east-1" });
const QUEUE_URL = process.env.PAYOUT_SQS_URL;

/**
 * Poll SQS for payout events
 */
async function pollPayoutQueue() {
  const params = {
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 20, // long polling
  };

  try {
    const data = await sqs.receiveMessage(params).promise();
    if (!data.Messages || data.Messages.length === 0) return;

    for (const message of data.Messages) {
      const payoutEvent = JSON.parse(message.Body);
      await handlePayoutEvent(payoutEvent);

      // Delete message after successful processing
      await sqs
        .deleteMessage({
          QueueUrl: QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle,
        })
        .promise();
    }
  } catch (err) {
    console.error("Error polling SQS:", err);
  }
}

/**
 * Handle individual payout event
 * @param {Object} event
 */
async function handlePayoutEvent(event) {
  const { payoutId } = event.detail;

  const payout = await Payout.findById(payoutId);
  if (!payout) {
    console.error("Payout not found:", payoutId);
    return;
  }

  // Skip if already released or on hold
  if (payout.status === "transferred" || payout.status === "on_hold") return;

  try {
    // Call Stripe or payment service
    const stripeResult = await processStripePayout(payout);

    // Update payout status
    payout.status = "transferred";
    payout.transferredAt = new Date();
    payout.stripeTransferId = stripeResult.id;
    await payout.save();

    // Audit log
    await AuditLog.create({
      performedBy: null, // system
      actionType: "PAYOUT_RELEASED",
      targetType: "payout",
      targetId: payout._id,
      description: `Payout released successfully for provider ${payout.providerId}`,
      before: {},
      after: payout.toObject(),
    });

    console.log("Payout released:", payoutId);
  } catch (err) {
    console.error("Payout failed:", payoutId, err);

    payout.status = "failed";
    payout.attempts += 1;

    // Put back in queue for retry if attempts < 3
    if (payout.attempts < 3) {
      payout.status = "scheduled"; // retry later
      await Payout.updateOne({ _id: payout._id }, payout);
      console.log("Retry scheduled for payout:", payoutId);
    } else {
      // Max attempts reached, audit log
      await AuditLog.create({
        performedBy: null,
        actionType: "PAYOUT_HELD",
        targetType: "payout",
        targetId: payout._id,
        description: `Payout failed after max retries for provider ${payout.providerId}`,
        before: {},
        after: payout.toObject(),
      });
    }

    await payout.save();
  }
}

// Poll continuously
setInterval(pollPayoutQueue, 5000);

module.exports = { pollPayoutQueue, handlePayoutEvent };
