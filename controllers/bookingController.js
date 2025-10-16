const Booking = require("../models/Booking");
const Service = require("../models/Service");
const User = require("../models/User");
const crypto = require("crypto");
const haversine = require("haversine-distance");

exports.createBooking = async (req, res) => {
  try {
    const {
      serviceId,
      scheduledAt,
      durationHours,
      photos,
      pricing,
      address,
      notes,
      specialInstructions,
    } = req.body;

    const customerId = req.user._id;

    // 1️⃣ Validate required fields
    if (!serviceId || !scheduledAt || !pricing || !durationHours) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // 2️⃣ Fetch service and provider details
    const service = await Service.findById(serviceId)
      .populate("providerId", "providerProfile.approvalStatus status");

    if (!service) return res.status(404).json({ message: "Service not found" });

    const provider = service.providerId;
    if (!provider || provider.providerProfile.approvalStatus !== "approved") {
      return res.status(400).json({ message: "Provider is not approved." });
    }

    if (!service.isActive || !service.isVisible) {
      return res.status(400).json({ message: "Service is not active or visible." });
    }

    // 3️⃣ Generate OTP for service start verification
    const otpCode = crypto.randomInt(100000, 999999).toString();

    // 4️⃣ Create booking document
    const booking = await Booking.create({
      customerId,
      providerId: provider._id,
      serviceId: service._id,
      categoryId: service.categoryId,
      status: "pending_payment",
      scheduledAt,
      durationHours,
      photos: photos || [],
      serviceAddress: address || {},
      pricingSnapshot: pricing,
      cancellationPolicySnapshot: {
        freeBeforeAcceptance: true,
        lateCancelFeePercent: 15,
      },
      completionOtp: {
        code: otpCode,
        verified: false,
      },
      notes,
      specialInstructions,
      autoExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // expire if not paid in 24h
    });

    // 5️⃣ Respond with booking info
    return res.status(201).json({
      message: "Booking created successfully.",
      booking,
    });
  } catch (err) {
    console.error("Booking creation error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};


exports.acceptBooking = async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const providerId = req.user._id;

    // 1️⃣ Fetch booking
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // 2️⃣ Check ownership
    if (booking.providerId.toString() !== providerId.toString()) {
      return res.status(403).json({ message: "Not authorized to accept this booking" });
    }

    // 3️⃣ Check current status
    if (booking.status !== "pending_provider_accept") {
      return res.status(400).json({
        message: `Cannot accept booking in '${booking.status}' state.`,
      });
    }

    // 4️⃣ Update booking
    booking.status = "accepted";
    booking.acceptedAt = new Date();
    await booking.save();

    return res.status(200).json({
      message: "Booking accepted successfully.",
      booking,
    });
  } catch (err) {
    console.error("Accept booking error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};


exports.verifyBookingOtp = async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const { otp } = req.body;
    const providerId = req.user._id;

    // 1️⃣ Fetch booking
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // 2️⃣ Check ownership
    if (booking.providerId.toString() !== providerId.toString()) {
      return res.status(403).json({ message: "Not authorized to verify this booking" });
    }

    // 3️⃣ Validate status
    if (booking.status !== "accepted") {
      return res.status(400).json({ message: `Cannot verify OTP in '${booking.status}' state.` });
    }

    // 4️⃣ Validate OTP
    if (!booking.completionOtp || booking.completionOtp.code !== otp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    // 5️⃣ Mark OTP verified and update status
    booking.completionOtp.verified = true;
    booking.completionOtp.verifiedAt = new Date();
    booking.status = "in_progress";
    await booking.save();

    return res.status(200).json({
      message: "OTP verified successfully. Booking is now in progress.",
      booking,
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};


exports.completeBooking = async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const providerId = req.user._id;

    // 1️⃣ Fetch booking
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // 2️⃣ Check ownership
    if (booking.providerId.toString() !== providerId.toString()) {
      return res.status(403).json({ message: "Not authorized to complete this booking" });
    }

    // 3️⃣ Validate current status
    if (booking.status !== "in_progress") {
      return res.status(400).json({ message: `Cannot complete booking in '${booking.status}' state.` });
    }

    // 4️⃣ Update booking status and timestamps
    const now = new Date();
    booking.status = "completed";
    booking.completedAt = now;

    // Calculate payout eligibility time (48 hours after completion)
    const payoutEligibility = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    booking.payout.eligibleForReleaseAt = payoutEligibility;
    booking.payout.status = "on_hold";

    await booking.save();

    return res.status(200).json({
      message: "Booking marked as completed. Payout will be released after 48 hours.",
      booking,
    });
  } catch (err) {
    console.error("Complete booking error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
