/**
 * /routes/healthRoute.js
 * ---------------------------------------------------------------
 * Provides lightweight health endpoints for system + workers.
 * Used by Elastic Beanstalk health checks or admin dashboards.
 * ---------------------------------------------------------------
 */

const express = require("express");
const router = express.Router();

let payoutWorkerHealth = {
  lastCheckIn: null,
  status: "idle",
};

let retryWorkerHealth = {
  lastRun: null,
  status: "idle",
};

/** PayoutWorker can call this periodically */
function updatePayoutWorkerHealth(status = "running") {
  payoutWorkerHealth.lastCheckIn = new Date().toISOString();
  payoutWorkerHealth.status = status;
}

/** RetryWorker can call this after each scan */
function updateRetryWorkerHealth(status = "running") {
  retryWorkerHealth.lastRun = new Date().toISOString();
  retryWorkerHealth.status = status;
}

/** Returns live health data */
router.get("/health/payout", (req, res) => {
  res.status(200).json({
    worker: "payout",
    status: payoutWorkerHealth.status,
    lastCheckIn: payoutWorkerHealth.lastCheckIn,
    timestamp: new Date().toISOString(),
  });
});

router.get("/health/retry", (req, res) => {
  res.status(200).json({
    worker: "retry",
    status: retryWorkerHealth.status,
    lastRun: retryWorkerHealth.lastRun,
    timestamp: new Date().toISOString(),
  });
});

router.get("/health", (req, res) => {
  res.status(200).json({
    app: "CrownStandard Backend",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    payoutWorker: payoutWorkerHealth,
    retryWorker: retryWorkerHealth,
  });
});

module.exports = {
  router,
  updatePayoutWorkerHealth,
  updateRetryWorkerHealth,
};
