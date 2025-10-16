// services/payoutEventPublisher.js
const AWS = require("aws-sdk");
const sqs = new AWS.SQS({ region: "ap-south-1" });

const QUEUE_URL = process.env.PAYOUT_QUEUE_URL;

async function sendToSQS(payload) {
  await sqs.sendMessage({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(payload),
  }).promise();
}

module.exports = { sendToSQS };
