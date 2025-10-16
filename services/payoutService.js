const Booking = require("../models/Booking");
const Payout = require("../models/Payout");
const { publishPayoutEvent } = require("./payoutPublisher");
const mongoose = require("mongoose");

async function schedulePayout(bookingId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ Fetch booking
    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) throw new Error("Booking not found");

    // 2️⃣ Check eligibility
    if (booking.status !== "completed") {
      throw new Error("Booking is not completed");
    }

    if (booking.disputeStatus === "open") {
      throw new Error("Payout on hold due to open dispute");
    }

    const now = new Date();
    const eligibleAt = new Date(booking.completedAt);
    eligibleAt.setHours(eligibleAt.getHours() + 48); // +48 hours

    if (now < eligibleAt) {
      throw new Error("Payout eligible only after 48h");
    }

    // 3️⃣ Calculate payout amount
    const providerShare = booking.pricingSnapshot.providerShare || 0;
    const totalTip = booking.tipSummary?.totalTip || 0;
    const payoutAmount = providerShare + totalTip;

    if (payoutAmount <= 0) {
      throw new Error("No payout due");
    }

    // 4️⃣ Create Payout record
    const payout = await Payout.create([{
      providerId: booking.providerId,
      bookingId: booking._id,
      paymentTransactionId: booking.payment?.paymentIntentId, // replace with actual transaction ID
      amount: payoutAmount,
      currency: booking.pricingSnapshot.currency,
      payoutType: "booking",
      status: "scheduled",
      releaseDate: now,
      metadata: {
        tipIncluded: !!totalTip,
        providerShare,
        totalTip
      }
    }], { session });

    // 5️⃣ Publish to EventBridge
    await publishPayoutEvent(payout[0]);

    await session.commitTransaction();
    session.endSession();

    return payout[0];

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

module.exports = {
  schedulePayout
};
