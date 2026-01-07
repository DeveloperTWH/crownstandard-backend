const Stripe = require("stripe");
const Booking = require("../models/Booking");
const PaymentTransaction = require("../models/PaymentTransaction");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handleStripeWebhook = async (req, res) => {
  let event;

  try {
    // 1️⃣ Verify signature to ensure request is from Stripe
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(
      req.body, // ✅ Use this instead  // Make sure to use raw body in Express middleware
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // 2️⃣ Handle payment success
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const bookingId = paymentIntent.metadata.bookingId;

      console.log(`✅ Payment succeeded for booking ${bookingId}`);

      // 3️⃣ Find Booking & Transaction
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        console.warn("⚠️ Booking not found for webhook paymentIntent:", paymentIntent.id);
        return res.json({ received: true });
      }

      const transaction = await PaymentTransaction.findOne({ paymentIntentId: paymentIntent.id });
      if (!transaction) {
        console.warn("⚠️ PaymentTransaction not found for webhook paymentIntent:", paymentIntent.id);
        return res.json({ received: true });
      }

      // 4️⃣ Extract payment method
      let method = "unknown";
      if (paymentIntent.charges?.data?.[0]?.payment_method_details?.type) {
        method = paymentIntent.charges.data[0].payment_method_details.type;
      }

      // 5️⃣ Update Transaction
      transaction.status = "succeeded";
      transaction.method = method;
      transaction.chargeId = paymentIntent.charges?.data?.[0]?.id || null;
      transaction.refundedAmount = 0;
      await transaction.save();

      // 6️⃣ Update Booking
      booking.status = "pending_provider_accept";
      booking.payment.status = "succeeded";
      booking.payment.capturedAt = new Date(paymentIntent.created * 1000);
      booking.payment.paymentIntentId = paymentIntent.id;
      booking.payment.applicationFee = booking.pricingSnapshot.platformCommission;
      booking.payment.transferAmount = booking.pricingSnapshot.providerShare;

      await booking.save();

      console.log(`✅ Booking ${bookingId} updated to pending_provider_accept`);
    }

    // 7️⃣ Handle payment failure
    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      const bookingId = paymentIntent.metadata.bookingId;

      const booking = await Booking.findById(bookingId);
      if (booking) {
        booking.status = "payment_failed";
        booking.payment.status = "failed";
        await booking.save();
      }

      const transaction = await PaymentTransaction.findOne({ paymentIntentId: paymentIntent.id });
      if (transaction) {
        transaction.status = "failed";
        await transaction.save();
      }

      console.log(`❌ Payment failed for booking ${bookingId}`);
    }

    // ✅ Always return 200 to Stripe
    res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
