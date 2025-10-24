/**
 * /payout/service/payoutService.js
 * ---------------------------------------------------------------
 * Handles full payout lifecycle:
 *  - eligibility validation
 *  - payout creation & Stripe transfer
 *  - retry, logging, and event publishing
 *  - multi-currency normalization with conversion-skip optimization
 * ---------------------------------------------------------------
 */

const mongoose = require("mongoose");
const Payout = require("../../models/Payout");
const Booking = require("../../models/Booking");
const { logAudit, logPayoutAction } = require("../utils/auditLogger");
const {
  normalizeToBookingCurrency,
  roundAmount,
  toMinorUnits,
} = require("../utils/currencyHelper");
const { publishEvent } = require("../events/eventPublisher");
const BookingService = require("./bookingService");
const PaymentService = require("./paymentService");
const TipService = require("./tipService");
const DisputeService = require("./disputeService");

// Stripe initialization
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

class PayoutService {
  /**
   * Main function to create and release provider payout.
   */
  static async createAndReleasePayout(bookingId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const booking = await BookingService.getBookingIfEligible(bookingId);
      if (!booking) {
        return { status: "held", error: "Booking not eligible for payout." };
      }

      // 1️⃣ Validate Payment
      const paymentTx = await PaymentService.getPaymentForBooking(bookingId);
      if (!paymentTx || paymentTx.status !== "succeeded") {
        throw new Error("Payment not found or not succeeded.");
      }

      // 2️⃣ Validate Tips (multi-currency aware)
      const tipTx = await TipService.getTipForBooking(bookingId);
      let totalTip = 0;
      if (tipTx) {
        const tipAmount = tipTx.amount - (tipTx.refundedAmount || 0);
        const tipCurrency = tipTx.currency;
        const bookingCurrency = booking.pricingSnapshot.currency;

        // ✅ Optimization: Skip conversion if both are same
        if (tipCurrency === bookingCurrency) {
          totalTip = roundAmount(tipAmount);
        } else {
          totalTip = await normalizeToBookingCurrency(
            tipAmount,
            tipCurrency,
            bookingCurrency
          );
        }
      }

      // 3️⃣ Check Dispute
      const disputeInfo = await DisputeService.checkDisputeStatus(bookingId);
      if (disputeInfo?.hold) {
        await logAudit({
          actionType: "PAYOUT_HELD",
          targetType: "booking",
          targetId: bookingId,
          description: "Payout held due to open or full-refund dispute.",
          meta: { disputeId: disputeInfo._id },
        });
        await session.abortTransaction();
        return { status: "held", error: "Payout on hold (dispute)." };
      }

      // 4️⃣ Calculate payout (normalize everything to booking currency)
      const bookingCurrency = booking.pricingSnapshot.currency;
      const providerShare =
        booking.pricingSnapshot.providerShare - (paymentTx.refundedAmount || 0);

      let finalAmount = roundAmount(providerShare + totalTip);

      // Adjust partial refund if applicable (in dispute decision)
      if (disputeInfo?.adjustment && disputeInfo.decision?.refundAmount) {
        const refundAmount = disputeInfo.decision.refundAmount;
        const refundCurrency =
          disputeInfo.decision.refundCurrency || bookingCurrency;

        // ✅ Optimization: Skip conversion if refund and booking currency are same
        let normalizedRefund;
        if (refundCurrency === bookingCurrency) {
          normalizedRefund = roundAmount(refundAmount);
        } else {
          normalizedRefund = await normalizeToBookingCurrency(
            refundAmount,
            refundCurrency,
            bookingCurrency
          );
        }

        finalAmount -= normalizedRefund;
      }

      finalAmount = roundAmount(finalAmount);

      // 5️⃣ Create payout record
      const payout = await Payout.create(
        [
          {
            providerId: booking.providerId,
            bookingId,
            paymentTransactionId: paymentTx._id,
            tipTransactionId: tipTx?._id || null,
            amount: finalAmount,
            currency: bookingCurrency,
            status: "scheduled",
            releaseDate: new Date(),
            idempotencyKey: `payout-${bookingId}`,
          },
        ],
        { session }
      );

      await logPayoutAction(
        bookingId,
        "PAYOUT_SCHEDULED",
        `Payout of ${finalAmount} ${bookingCurrency} scheduled.`,
        { payoutId: payout[0]._id }
      );

      await publishEvent("PAYOUT_SCHEDULED", {
        bookingId,
        providerId: booking.providerId,
        amount: finalAmount,
        currency: bookingCurrency,
      });

      // 6️⃣ Execute Stripe Transfer
      const providerAccountId =
        booking.providerStripeAccountId || booking.providerAccountId;
      if (!providerAccountId) {
        throw new Error("Missing provider Stripe account ID.");
      }

      const transfer = await stripe.transfers.create({
        amount: toMinorUnits(finalAmount),
        currency: bookingCurrency.toLowerCase(),
        destination: providerAccountId,
        description: `Payout for booking ${bookingId}`,
      });

      // 7️⃣ Update records
      payout[0].status = "transferred";
      payout[0].stripeTransferId = transfer.id;
      payout[0].transferredAt = new Date();
      await payout[0].save({ session });

      booking.payout.status = "released";
      booking.payout.releasedAt = new Date();
      await booking.save({ session });

      // 8️⃣ Log success
      await logPayoutAction(
        bookingId,
        "PAYOUT_RELEASED",
        `Payout released successfully: ${finalAmount} ${bookingCurrency}`,
        { transferId: transfer.id, payoutId: payout[0]._id }
      );

      await publishEvent("PAYOUT_RELEASED", {
        bookingId,
        providerId: booking.providerId,
        payoutId: payout[0]._id,
        stripeTransferId: transfer.id,
        amount: finalAmount,
        currency: bookingCurrency,
      });

      await session.commitTransaction();
      return { status: "success", payout: payout[0] };
    } catch (err) {
      await session.abortTransaction();

      console.error("❌ Payout creation error:", err);

      await logAudit({
        actionType: "PAYOUT_FAILED",
        targetType: "booking",
        targetId: bookingId,
        description: err.message,
      });

      await publishEvent("PAYOUT_FAILED", {
        bookingId,
        reason: err.message,
      });

      return { status: "failed", error: err.message };
    } finally {
      session.endSession();
    }
  }
}

module.exports = PayoutService;
