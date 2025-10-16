const Stripe = require("stripe");
const Booking = require("../models/Booking");
const PaymentTransaction = require("../models/PaymentTransaction");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // 1️⃣ Verify event signature
    event = stripe.webhooks.constructEvent(
      req.rawBody, // must be raw body, not parsed JSON
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("⚠️  Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 2️⃣ Switch on event type
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;

        console.log(`✅ Payment succeeded: ${paymentIntent.id}`);

        // Update PaymentTransaction
        const transaction = await PaymentTransaction.findOneAndUpdate(
          { paymentIntentId: paymentIntent.id },
          { status: "succeeded" },
          { new: true }
        );

        if (transaction) {
          // Update Booking status
          await Booking.findByIdAndUpdate(transaction.bookingId, {
            status: "pending_provider_accept",
          });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;

        console.log(`❌ Payment failed: ${paymentIntent.id}`);

        await PaymentTransaction.findOneAndUpdate(
          { paymentIntentId: paymentIntent.id },
          { status: "failed" }
        );

        // Also mark booking as payment_failed
        const tx = await PaymentTransaction.findOne({
          paymentIntentId: paymentIntent.id,
        });

        if (tx) {
          await Booking.findByIdAndUpdate(tx.bookingId, {
            status: "payment_failed",
          });
        }
        break;
      }

      // (Optional) Refund handling
      case "charge.refunded": {
        const charge = event.data.object;

        console.log(`💸 Charge refunded: ${charge.id}`);

        await PaymentTransaction.findOneAndUpdate(
          { chargeId: charge.id },
          {
            status: charge.amount_refunded > 0 ? "refunded" : "partial_refunded",
            refundedAmount: charge.amount_refunded / 100,
            refundedAt: new Date(),
          }
        );
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).send("✅ Webhook processed");
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Internal Server Error");
  }
};
