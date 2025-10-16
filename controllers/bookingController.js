const Booking = require("../models/Booking");
const Service = require("../models/Service");
const User = require("../models/User");
const crypto = require("crypto");
const haversine = require("haversine-distance");
const geocodeAddress = require("../utils/geocode");
const Invoice = require("../models/Invoice");
const PaymentTransaction = require("../models/PaymentTransaction");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


exports.createBooking = async (req, res) => {
  try {
    const {
      serviceId,
      scheduledAt,
      durationHours,
      photos,
      address,
      notes,
      specialInstructions,
      couponCode // optional future use
    } = req.body;

    const customerId = req.user._id;

    // 1️⃣ Basic field validation
    if (!serviceId || !scheduledAt || !durationHours || !address) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // 2️⃣ Fetch service and provider
    const service = await Service.findById(serviceId).populate("providerId", "providerProfile status");
    if (!service) return res.status(404).json({ message: "Service not found." });

    const provider = service.providerId;
    if (!provider || provider.providerProfile.approvalStatus !== "approved") {
      return res.status(400).json({ message: "Provider is not approved." });
    }
    if (!service.isActive || !service.isVisible) {
      return res.status(400).json({ message: "Service is not active or visible." });
    }

    // ✅ 3️⃣ Ensure customer location (geocode if missing)
    let customerCoords = address?.location?.coordinates;
    if (
      !customerCoords ||
      customerCoords.length !== 2 ||
      (customerCoords[0] === 0 && customerCoords[1] === 0)
    ) {
      const geoResult = await geocodeAddress(address);
      if (!geoResult) {
        return res.status(400).json({
          message: "Unable to geocode the provided address. Please check the address details.",
        });
      }
      customerCoords = [geoResult.lng, geoResult.lat];
      address.location = {
        type: "Point",
        coordinates: customerCoords,
      };
    }

    // ✅ 4️⃣ Provider location validation + radius check
    const providerCoords = provider?.providerProfile?.serviceAddress?.location?.coordinates;
    if (!providerCoords || providerCoords.length !== 2) {
      return res.status(400).json({ message: "Provider location is not configured." });
    }

    const [providerLng, providerLat] = providerCoords;
    const [customerLng, customerLat] = customerCoords;
    const providerLocation = { lat: providerLat, lng: providerLng };
    const customerLocation = { lat: customerLat, lng: customerLng };

    const distanceMeters = haversine(providerLocation, customerLocation);
    const distanceKm = distanceMeters / 1000;
    const allowedRadius = provider.providerProfile.serviceRadiusKm || 10;

    if (distanceKm > allowedRadius) {
      return res.status(400).json({
        message: `This booking is outside the provider's service range. Distance: ${distanceKm.toFixed(
          2
        )} km, Allowed: ${allowedRadius} km.`,
      });
    }

    // ✅ 5️⃣ Calculate pricing server-side (no trust on client)
    let totalPayable;

    if (service.priceUnit === "per_hour") {
      totalPayable = service.basePrice * durationHours;
    } else {
      totalPayable = service.basePrice;
    }

    // TODO: Optional coupon logic
    let discount = 0;
    if (couponCode) {
      // implement coupon validation later
      discount = 0;
    }

    const quotedSubtotal = totalPayable - discount;
    const platformCommission = quotedSubtotal * 0.25; // 💰 can be moved to env/config
    const providerShare = quotedSubtotal - platformCommission;

    const pricingSnapshot = {
      currency: service.currency || "CAD",
      basePrice: service.basePrice,
      priceUnit: service.priceUnit,
      minHours: service.minHours,
      totalHours: durationHours,
      quotedSubtotal,
      discount,
      totalPayable: quotedSubtotal,
      platformCommission,
      providerShare,
    };

    // ✅ 6️⃣ Generate OTP for service completion
    const otpCode = crypto.randomInt(100000, 999999).toString();

    // ✅ 7️⃣ Create booking document
    const booking = await Booking.create({
      customerId,
      providerId: provider._id,
      serviceId: service._id,
      categoryId: service.categoryId,
      status: "pending_payment",
      scheduledAt,
      durationHours,
      photos: photos || [],
      serviceAddress: address,
      pricingSnapshot,
      cancellationPolicySnapshot: {
        freeBeforeAcceptance: true,
        lateCancelFeePercent: 15,
      },
      payment: {
        status: "pending",
        currency: service.currency || "CAD",
      },
      completionOtp: {
        code: otpCode,
        verified: false,
      },
      notes,
      specialInstructions,
      autoExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // ✅ 8️⃣ Return booking info (mask OTP in response)
    const bookingObj = booking.toObject();
    if (bookingObj.completionOtp) delete bookingObj.completionOtp.code;

    return res.status(201).json({
      message: "Booking created successfully.",
      booking: bookingObj,
    });
  } catch (err) {
    console.error("❌ Booking creation error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};


exports.acceptBooking = async (req, res) => {
  try {
    const providerId = req.user._id;

    // 1️⃣ Find booking
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // 2️⃣ Ensure provider is authorized
    if (booking.providerId.toString() !== providerId.toString()) {
      return res.status(403).json({ message: "Not authorized for this booking" });
    }

    // 3️⃣ Check current status
    if (booking.status !== "pending_provider_accept") {
      return res.status(409).json({ message: "Booking is not awaiting provider acceptance" });
    }

    // 4️⃣ Update booking
    booking.status = "accepted";
    booking.acceptedAt = new Date();
    const EXPIRY_HOURS = 24;
    booking.autoExpireAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);
    await booking.save();

    return res.json({
      message: "Booking accepted successfully",
      bookingId: booking._id,
      status: booking.status,
      acceptedAt: booking.acceptedAt,
    });
  } catch (err) {
    console.error("❌ Accept Booking Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.verifyBookingOtp = async (req, res) => {
  try {
    const { id } = req.params; // booking ID
    const { otp } = req.body;
    const providerId = req.user._id;

    // 1️⃣ Validate input
    if (!otp) {
      return res.status(400).json({ message: "OTP is required." });
    }

    // 2️⃣ Fetch booking and verify ownership
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }

    if (booking.providerId.toString() !== providerId.toString()) {
      return res.status(403).json({ message: "You are not authorized for this booking." });
    }

    // 3️⃣ Validate booking status
    if (booking.status !== "accepted") {
      return res.status(400).json({
        message: `OTP verification is not allowed in the current status: ${booking.status}`,
      });
    }

    // 4️⃣ Check if already verified
    if (booking.completionOtp?.verified) {
      return res.status(409).json({ message: "OTP already verified." });
    }

    // 5️⃣ Validate OTP
    if (booking.completionOtp?.code !== otp) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    // 6️⃣ Mark verified & update status
    booking.completionOtp.verified = true;
    booking.completionOtp.verifiedAt = new Date();
    booking.status = "in_progress";
    await booking.save();

    return res.status(200).json({
      message: "OTP verified successfully. Service has now started.",
      booking: {
        id: booking._id,
        status: booking.status,
        verifiedAt: booking.completionOtp.verifiedAt,
      },
    });
  } catch (err) {
    console.error("❌ OTP Verification Error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};


exports.completeBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const providerId = req.user._id;

    // 1️⃣ Fetch booking
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    // 2️⃣ Security checks
    if (booking.providerId.toString() !== providerId.toString()) {
      return res.status(403).json({ message: "You are not authorized for this booking." });
    }

    if (booking.status !== "in_progress") {
      return res.status(400).json({ message: `Cannot complete booking in status: ${booking.status}` });
    }

    if (!booking.completionOtp?.verified) {
      return res.status(400).json({ message: "OTP is not verified yet. Cannot complete booking." });
    }

    // 3️⃣ Update booking status & payout info
    const now = new Date();
    booking.status = "completed";
    booking.completedAt = now;

    const eligibleAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // +48h payout window
    booking.payout.eligibleForReleaseAt = eligibleAt;
    booking.payout.status = "pending";

    await booking.save();

    // 4️⃣ Generate unique invoice number (timestamp + random suffix)
    const invoiceNumber = `INV-${Date.now()}-${new mongoose.Types.ObjectId().toString().slice(-6)}`;

    // 5️⃣ Create invoice immediately
    const invoice = await Invoice.create({
      bookingId: booking._id,
      paymentTransactionId: booking.payment?.paymentTransactionId || null,
      invoiceNumber,
      issuedTo: booking.customerId,
      issuedBy: booking.providerId,
      currency: booking.pricingSnapshot?.currency || "CAD",
      lineItems: [
        {
          description: "Cleaning Service",
          unitPrice: booking.pricingSnapshot?.basePrice || 0,
          quantity: booking.pricingSnapshot?.totalHours || 1,
          total: booking.pricingSnapshot?.totalPayable || 0,
        },
      ],
      subtotal: booking.pricingSnapshot?.quotedSubtotal || 0,
      tax: 0, // TODO: add GST/VAT logic later
      total: booking.pricingSnapshot?.totalPayable || 0,
      pdfUrl: null,
      status: "issued",
      paymentStatus: booking.payment?.status || "pending",
    });

    return res.status(200).json({
      message: "Booking completed successfully. Invoice generated and payout scheduled.",
      booking: {
        id: booking._id,
        status: booking.status,
        completedAt: booking.completedAt,
        eligibleForReleaseAt: eligibleAt,
        payoutStatus: booking.payout.status,
      },
      invoice,
    });
  } catch (err) {
    console.error("❌ Complete Booking Error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};


exports.rejectBooking = async (req, res) => {
  try {
    const providerId = req.user._id;
    const { reason } = req.body;

    // 1️⃣ Find booking
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // 2️⃣ Authorization check
    if (booking.providerId.toString() !== providerId.toString()) {
      return res.status(403).json({ message: "Not authorized for this booking" });
    }

    // 3️⃣ Validate booking status
    if (booking.status !== "pending_provider_accept") {
      return res.status(400).json({ message: "Booking is not pending provider acceptance" });
    }

    // 4️⃣ Refund payment (if already charged)
    const transaction = await PaymentTransaction.findOne({ bookingId: booking._id });
    if (transaction && transaction.status === "succeeded") {
      const refund = await stripe.refunds.create({
        payment_intent: transaction.paymentIntentId,
      });

      transaction.status = "refunded";
      transaction.refundedAmount = transaction.amount;
      transaction.refundedAt = new Date();
      await transaction.save();
    }

    // 5️⃣ Update booking status → cancelled
    booking.status = "cancelled";
    booking.rejection = {
      reason: reason || "No reason provided",
      rejectedAt: new Date(),
    };
    booking.cancelledAt = new Date();
    await booking.save();

    return res.json({
      message: "Booking rejected and refunded successfully",
      bookingId: booking._id,
      status: booking.status,
      rejection: booking.rejection,
    });
  } catch (err) {
    console.error("❌ Reject Booking Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
