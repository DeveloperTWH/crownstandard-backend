const Booking = require("../models/Booking");
const PaymentTransaction = require("../models/PaymentTransaction");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.createPaymentIntent = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const customerId = req.user._id;

    // 1️⃣ Validate input
    if (!bookingId) {
      return res.status(400).json({ message: "Booking ID is required." });
    }

    // 2️⃣ Fetch booking
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    // ✅ Only the customer who created the booking can pay
    if (booking.customerId.toString() !== customerId.toString()) {
      return res.status(403).json({ message: "You are not authorized to pay for this booking." });
    }

    // ✅ Payment can only be created if status is `pending_payment`
    if (booking.status !== "pending_payment") {
      return res.status(400).json({
        message: `Cannot create payment for a booking in status: ${booking.status}`,
      });
    }

    // 3️⃣ Pull amount and currency from DB (secure — ignore client input)
    const amount = booking.pricingSnapshot?.totalPayable;
    const currency = booking.pricingSnapshot?.currency || "CAD";

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid booking amount." });
    }

    // 4️⃣ Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe uses cents
      currency,
      metadata: {
        bookingId: booking._id.toString(),
        customerId: booking.customerId.toString(),
        providerId: booking.providerId.toString(),
      },
      automatic_payment_methods: { enabled: true },
    });

    // 5️⃣ Save transaction record
    const transaction = await PaymentTransaction.create({
      bookingId: booking._id,
      customerId: booking.customerId,
      providerId: booking.providerId,
      paymentIntentId: paymentIntent.id,
      currency,
      amount,
      applicationFee: booking.pricingSnapshot.platformCommission,
      transferAmount: booking.pricingSnapshot.providerShare,
      method: "card",
      status: "pending",
    });

    // 6️⃣ Update booking with paymentIntent ID
    booking.payment.paymentIntentId = paymentIntent.id;
    booking.payment.status = "pending";
    booking.payment.amount = amount;
    booking.payment.currency = currency;
    await booking.save();

    return res.status(201).json({
      message: "PaymentIntent created successfully.",
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      transactionId: transaction._id,
    });
  } catch (err) {
    console.error("❌ Payment Intent Error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};
