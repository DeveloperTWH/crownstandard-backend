// workers/retryWorker.js
const Payout = require("../models/Payout");
const { payoutWorker } = require("./payoutWorker");
const { logAudit } = require("../utils/auditLogger");

/**
 * Handles retrying failed payouts
 * @param {Object} eventDetail - Details about the payout to retry
 *        Must contain payoutId
 */
async function retryWorker(eventDetail) {
  const { payoutId } = eventDetail;

  if (!payoutId) {
    console.warn("retryWorker: payoutId missing in eventDetail", eventDetail);
    return;
  }

  const payout = await Payout.findById(payoutId);
  if (!payout) {
    console.warn("retryWorker: Payout not found", payoutId);
    return;
  }

  if (payout.status === "transferred") {
    console.log("retryWorker: Payout already completed", payoutId);
    return;
  }

  if (payout.attempts >= 3) {
    console.warn("retryWorker: Max retry attempts reached", payoutId);
    await logAudit({
      performedBy: null,
      actionType: "PAYOUT_FAILED",
      targetType: "payout",
      targetId: payout._id,
      description: `Payout reached max retry attempts (${payout.attempts})`,
      before: payout.toObject(),
      after: payout.toObject(),
    });
    return;
  }

  // Increment attempts and save
  payout.attempts += 1;
  await payout.save();

  // Call payoutWorker again
  try {
    await payoutWorker({ payoutId });
  } catch (err) {
    console.error("retryWorker: Error retrying payout", payoutId, err);
    // Optional: trigger another retry via EventBridge/SQS with backoff
  }
}

module.exports = {
  retryWorker,
};
