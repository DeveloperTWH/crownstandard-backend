/**
 * CrownStandard Payout Test Runner
 * -----------------------------------------------------
 * This script:
 * 1️⃣ Connects to MongoDB
 * 2️⃣ Creates a payout for a booking (non-disputed)
 * 3️⃣ Runs the payout worker immediately
 * 4️⃣ Logs results for verification
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");

// Core services
const PayoutService = require("./payout/services/payoutService");
const PayoutWorker = require("./payout/workers/payoutWorker");
const AuditLog = require("./models/AuditLog");
const Payout = require("./models/Payout");

(async () => {
  try {
    console.log("🚀 Connecting to MongoDB...");
    await connectDB();

    const bookingId = "68ff1d2f9278ed988614687c"; // ✅ booking without dispute

    console.log(`\n🎯 Step 1: Creating payout for booking ${bookingId}...`);
    const payout = await PayoutService.createPayoutForBooking(bookingId);
    console.log("✅ Payout created:", payout._id.toString(), payout.amount, payout.currency);

    console.log("\n⚙️ Step 2: Running payout worker...");
    await PayoutWorker.processSinglePayout(payout);
    console.log("✅ Worker executed successfully");

    console.log("\n📊 Step 3: Fetching latest audit logs...");
    const logs = await AuditLog.find({ targetId: payout._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    console.log("🧾 Last 5 Audit Logs:");
    logs.forEach((log) => {
      console.log(`- [${log.actionType}] ${log.description}`);
    });

    console.log("\n💰 Step 4: Verifying final payout status...");
    const updatedPayout = await Payout.findById(payout._id).lean();
    console.log("📦 Final Payout Document:");
    console.table({
      id: updatedPayout._id.toString(),
      status: updatedPayout.status,
      amount: updatedPayout.amount,
      stripeTransferId: updatedPayout.stripeTransferId || "—",
      attempts: updatedPayout.attempts || 0,
    });

    console.log("\n✅ Test completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err.message);
    process.exit(1);
  }
})();
