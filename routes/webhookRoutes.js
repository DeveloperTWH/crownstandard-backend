const express = require("express");
const router = express.Router();
const { handleStripeWebhook } = require("../controllers/webhookController");

// Stripe webhooks don't require auth — Stripe sends them directly
router.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }), // IMPORTANT
  handleStripeWebhook
);

module.exports = router;
