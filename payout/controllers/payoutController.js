// payout/controllers/payoutController.js
/**
 * CrownStandard Payout Controller
 * -----------------------------------------------------
 * Provides admin and system API endpoints for managing payouts.
 * Includes retry, hold, release, and fetch operations.
 */

const express = require("express");
const router = express.Router();

const Payout = require("../../models/Payout");
const Booking = require("../../models/Booking");
const RetryWorker = require("../workers/retryWorker");
const PayoutService = require("../services/payoutService");
const AuditLogService = require("../services/auditLogService");


// 🧭 Health Check
router.get("/health", async (req, res) => {
  res.status(200).json({ message: "Payout controller active ✅" });
});


// 📋 Get All Payouts (paginated)
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = status ? { status } : {};

    const payouts = await Payout.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("providerId bookingId")
      .lean();

    const count = await Payout.countDocuments(query);

    res.status(200).json({
      total: count,
      page: Number(page),
      limit: Number(limit),
      data: payouts,
    });
  } catch (err) {
    console.error("❌ GET /payouts failed:", err.message);
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
});


// 🔍 Get Single Payout by ID
router.get("/:id", async (req, res) => {
  try {
    const payout = await PayoutService.getPayoutById(req.params.id);
    if (!payout) return res.status(404).json({ error: "Payout not found" });
    res.status(200).json(payout);
  } catch (err) {
    console.error("❌ GET /payout/:id failed:", err.message);
    res.status(500).json({ error: "Failed to fetch payout" });
  }
});


// 🔁 Manually Retry a Failed Payout
router.post("/:id/retry", async (req, res) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return res.status(404).json({ error: "Payout not found" });

    if (payout.status !== "failed") {
      return res
        .status(400)
        .json({ error: "Only failed payouts can be retried" });
    }

    await RetryWorker.retrySinglePayout(payout);
    await AuditLogService.logSystemAction(
      "PAYOUT_RETRY_SCHEDULED",
      "payout",
      payout._id,
      `Manual retry initiated by admin`,
      { performedBy: req.user?._id || "admin" }
    );

    res.status(200).json({ message: "Retry initiated successfully" });
  } catch (err) {
    console.error("❌ POST /payout/:id/retry failed:", err.message);
    res.status(500).json({ error: "Retry failed" });
  }
});


// ✋ Put Payout On Hold (admin action)
router.post("/:id/hold", async (req, res) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return res.status(404).json({ error: "Payout not found" });

    payout.status = "on_hold";
    payout.holdReason = req.body.reason || "Manual hold by admin";
    await payout.save();

    await AuditLogService.logAction({
      actionType: "PAYOUT_HELD",
      performedBy: req.user?._id || "admin",
      targetType: "payout",
      targetId: payout._id,
      description: "Payout manually held by admin",
      meta: { reason: payout.holdReason },
    });

    res.status(200).json({ message: "Payout placed on hold successfully" });
  } catch (err) {
    console.error("❌ POST /payout/:id/hold failed:", err.message);
    res.status(500).json({ error: "Failed to hold payout" });
  }
});


// ▶️ Release Payout Manually (after dispute or admin approval)
router.post("/:id/release", async (req, res) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return res.status(404).json({ error: "Payout not found" });

    if (payout.status !== "on_hold") {
      return res
        .status(400)
        .json({ error: "Only held payouts can be released manually" });
    }

    payout.status = "scheduled";
    payout.holdReason = null;
    await payout.save();

    await AuditLogService.logAction({
      actionType: "PAYOUT_RELEASED",
      performedBy: req.user?._id || "admin",
      targetType: "payout",
      targetId: payout._id,
      description: "Payout manually released by admin",
      meta: { releasedBy: req.user?._id || "system" },
    });

    res.status(200).json({ message: "Payout released successfully" });
  } catch (err) {
    console.error("❌ POST /payout/:id/release failed:", err.message);
    res.status(500).json({ error: "Failed to release payout" });
  }
});


// 📊 Summary — quick dashboard stats
router.get("/summary/stats", async (req, res) => {
  try {
    const totals = await Payout.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const summary = totals.reduce((acc, cur) => {
      acc[cur._id] = {
        count: cur.count,
        totalAmount: Math.round(cur.totalAmount * 100) / 100,
      };
      return acc;
    }, {});

    res.status(200).json({ summary });
  } catch (err) {
    console.error("❌ GET /payout/summary/stats failed:", err.message);
    res.status(500).json({ error: "Failed to fetch payout summary" });
  }
});

module.exports = router;
