// payout/services/payoutService.js
/**
 * CrownStandard Payout Service
 * -----------------------------------------------------
 * Handles creation, validation, and orchestration of payouts.
 * Combines booking share + tips into a single payout transaction.
 */

const mongoose = require("mongoose");
const Booking = require("../../models/Booking");
const Payout = require("../../models/Payout");
const PaymentTransaction = require("../../models/PaymentTransaction");
const TipTransaction = require("../../models/TipTransaction");
const AuditLogService = require("./auditLogService");
const amountUtils = require("../utils/amountUtils");
const { EventEmitter } = require("events");

const eventBus = new EventEmitter();

class PayoutService {
  /**
   * Creates payout record for a completed booking if eligible.
   * @param {ObjectId} bookingId
   * @returns {Promise<Object>} The created Payout document
   */
  static async createPayoutForBooking(bookingId) {
    const useTransaction = process.env.MONGO_TRANSACTIONS !== "false"; // ✅ added
    const session = useTransaction ? await mongoose.startSession() : null;
    if (session) session.startTransaction(); // ✅ only start if allowed

    try {
      // Fetch booking
      const booking = session
        ? await Booking.findById(bookingId).session(session)
        : await Booking.findById(bookingId);
      if (!booking) throw new Error("Internal: Booking not found");

      // ✅ Eligibility validation
      if (booking.status !== "completed")
        throw new Error("Internal: Booking not completed");
      if (booking.payout.status !== "not_completed_yet")
        throw new Error("Internal: Payout already processed or pending");
      if (booking.disputeStatus !== "none")
        throw new Error("Internal: Payout blocked due to dispute");

      // Load transactions
      const paymentTx = session
        ? await PaymentTransaction.findOne({ bookingId }).session(session)
        : await PaymentTransaction.findOne({ bookingId });
      if (!paymentTx || paymentTx.status !== "succeeded")
        throw new Error("Internal: Payment transaction invalid or not succeeded");

      const tipTx = session
        ? await TipTransaction.findOne({
          bookingId,
          status: "succeeded",
          payoutStatus: "not_initiated",
        }).session(session)
        : await TipTransaction.findOne({
          bookingId,
          status: "succeeded",
          payoutStatus: "not_initiated",
        });

      // 💸 Compute total payout amount
      const totalPayout = amountUtils.calculateTotalPayout({
        booking,
        paymentTx,
        tipTx,
      });

      // 🧾 Create payout record
      const payoutDoc = {
        providerId: booking.providerId,
        bookingId: booking._id,
        paymentTransactionId: paymentTx._id,
        tipTransactionId: tipTx?._id,
        amount: totalPayout.amount,
        currency: totalPayout.currency,
        idempotencyKey: `payout_${booking._id}_${Date.now()}`,
        payoutType: "booking",
        releaseDate: new Date(),
        metadata: {
          bookingRef: booking._id.toString(),
          paymentIntentId: paymentTx.paymentIntentId,
        },
      };

      const payout = session
        ? await Payout.create([payoutDoc], { session })
        : [await Payout.create(payoutDoc)];

      // 🪙 Update booking payout info
      booking.payout.status = "pending";
      booking.payout.eligibleForReleaseAt = new Date();
      booking.payoutRefId = payout[0]._id;
      session ? await booking.save({ session }) : await booking.save();

      // 💰 Mark tip payout status
      if (tipTx) {
        tipTx.payoutStatus = "scheduled";
        tipTx.payoutRefId = payout[0]._id;
        session ? await tipTx.save({ session }) : await tipTx.save();
      }

      // 🧾 Audit log
      await AuditLogService.logSystemAction(
        "PAYOUT_SCHEDULED",
        "payout",
        payout[0]._id,
        `Payout scheduled for provider ${booking.providerId}`,
        {
          amount: totalPayout.amount,
          currency: totalPayout.currency,
          bookingId: booking._id,
        }
      );

      // 📢 Event
      eventBus.emit("PAYOUT_SCHEDULED", {
        payoutId: payout[0]._id,
        providerId: booking.providerId,
        amount: totalPayout.amount,
      });

      if (session) await session.commitTransaction();
      return payout[0];
    } catch (err) {
      if (session) await session.abortTransaction();
      console.error("❌ PayoutService.createPayoutForBooking error:", err.message);
      await AuditLogService.logError(err, "PayoutService.createPayoutForBooking", { bookingId });
      throw err;
    } finally {
      if (session) session.endSession();
    }
  }


  /**
   * Fetch payouts by provider (for dashboard or reconciliation)
   */
  static async getPayoutsForProvider(providerId, limit = 20) {
    return Payout.find({ providerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  /**
   * Mark payout as failed (used by worker on transfer error)
   */
  static async markAsFailed(payoutId, reason) {
    const payout = await Payout.findById(payoutId);
    if (!payout) throw new Error("Internal: Payout not found");

    payout.status = "failed";
    payout.failureReason = reason;
    payout.lastFailedAt = new Date();
    payout.attempts += 1;
    await payout.save();

    await AuditLogService.logSystemAction(
      "PAYOUT_HELD",
      "payout",
      payout._id,
      `Payout failed: ${reason}`,
      { attempts: payout.attempts }
    );

    eventBus.emit("PAYOUT_FAILED", { payoutId: payout._id });
    return payout;
  }

  /**
   * Mark payout as successfully transferred.
   */
  static async markAsTransferred(payoutId, stripeTransferId) {
    const payout = await Payout.findById(payoutId);
    if (!payout) throw new Error("Internal: Payout not found");

    payout.status = "transferred";
    payout.transferredAt = new Date();
    payout.stripeTransferId = stripeTransferId;
    await payout.save();

    await AuditLogService.logSystemAction(
      "PAYOUT_RELEASED",
      "payout",
      payout._id,
      `Payout released successfully via Stripe`,
      { stripeTransferId }
    );

    eventBus.emit("PAYOUT_RELEASED", { payoutId, stripeTransferId });
    return payout;
  }

  /**
   * Get payout details by ID.
   */
  static async getPayoutById(payoutId) {
    return Payout.findById(payoutId).populate("providerId bookingId").lean().exec();
  }
}

module.exports = PayoutService;
