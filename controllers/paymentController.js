const Booking = require("../models/Booking");
const PaymentTransaction = require("../models/PaymentTransaction");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.createPaymentIntent = async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const customerId = req.user._id;

    // 1️⃣ Find booking and validate ownership
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.customerId.toString() !== customerId.toString()) {
      return res.status(403).json({ message: "Not authorized to pay for this booking" });
    }

    // 2️⃣ Validate status
    if (booking.status !== "pending_payment") {
      return res.status(400).json({ message: "Booking is not awaiting payment" });
    }

    // 3️⃣ Create Stripe PaymentIntent
    const amountInCents = Math.round(booking.pricingSnapshot.totalPayable * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: booking.pricingSnapshot.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        bookingId: booking._id.toString(),
        customerId: booking.customerId.toString(),
        providerId: booking.providerId.toString(),
      },
    });

    // 4️⃣ Save PaymentTransaction in DB
    await PaymentTransaction.create({
      bookingId: booking._id,
      customerId: booking.customerId,
      providerId: booking.providerId,
      paymentIntentId: paymentIntent.id,
      amount: booking.pricingSnapshot.totalPayable,
      applicationFee: booking.pricingSnapshot.totalPayable * 0.25, // example 25% commission
      transferAmount: booking.pricingSnapshot.totalPayable * 0.75,
      currency: booking.pricingSnapshot.currency,
      method: "card",
      status: "pending",
    });

    // 5️⃣ Return client secret for frontend to confirm payment
    return res.status(201).json({
      message: "PaymentIntent created successfully",
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: booking.pricingSnapshot.totalPayable,
      currency: booking.pricingSnapshot.currency,
    });
  } catch (err) {
    console.error("Stripe PaymentIntent error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
