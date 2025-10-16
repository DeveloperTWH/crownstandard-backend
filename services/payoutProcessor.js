// services/payoutProcessor.js
const Payout = require("../models/Payout");
const { processStripePayout } = require("./stripeService");
const { logAudit } = require("./auditLogger");

const MAX_RETRIES = 3;

async function handlePayoutMessage(message) {
  const { payoutId } = JSON.parse(message.Body);

  const payout = await Payout.findById(payoutId);
  if (!payout) return;

  try {
    const result = await processStripePayout(payout); // your stripe transfer logic

    payout.status = "transferred";
    payout.transferredAt = new Date();
    await payout.save();

    await logAudit({
      performedBy: payout.providerId,
      actionType: "PAYOUT_RELEASED",
      targetType: "payout",
      targetId: payout._id,
      description: `Payout transferred successfully`,
      after: { status: "transferred" },
    });

  } catch (err) {
    payout.status = "on_hold";
    payout.attempts = (payout.attempts || 0) + 1;
    payout.failureReason = err.message;

    await payout.save();

    await logAudit({
      performedBy: payout.providerId,
      actionType: "PAYOUT_HELD",
      targetType: "payout",
      targetId: payout._id,
      description: `Payout failed: ${err.message}`,
      after: { status: "on_hold", attempts: payout.attempts },
    });

    // Retry if not exceeded max retries
    if (payout.attempts < MAX_RETRIES) {
      setTimeout(() => handlePayoutMessage(message), 5 * 60 * 1000); // retry after 5 min
    }
  }
}

module.exports = { handlePayoutMessage };
