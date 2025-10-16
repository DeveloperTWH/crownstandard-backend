const express = require("express");
const router = express.Router();
const { createPaymentIntent } = require("../controllers/paymentController");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

// Only customers can create payment intents
router.post(
  "/payments/bookings/:id/create-intent",
  auth,
  requireRole("customer"),
  createPaymentIntent
);

module.exports = router;
