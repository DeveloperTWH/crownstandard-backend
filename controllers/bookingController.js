const Booking = require("../models/Booking");
const mongoose = require("mongoose");
const Service = require("../models/Service");
const User = require("../models/User");
const crypto = require("crypto");
const haversine = require("haversine-distance");
const geocodeAddress = require("../utils/geocode");
const Invoice = require("../models/Invoice");
const PaymentTransaction = require("../models/PaymentTransaction");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// After booking is created successfully
const ChatThread = require("../models/ChatThread");


 exports.createBooking = async (req, res) => {
  try {
    const {
      serviceId,
      scheduledAt,
      durationHours,
      photos = [],
      address,
      notes,
      specialInstructions,
    } = req.body;

    const customerId = req.user?._id;
    if (!customerId || !serviceId || !scheduledAt || !durationHours || !address) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    /* ---------------------------------
       1️⃣ Fetch service ONLY
    ---------------------------------- */
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }

    /* ---------------------------------
       2️⃣ Fetch provider DIRECTLY
       (NO populate)
    ---------------------------------- */
    const provider = await User.findById(service.providerId);
    if (!provider) {
      return res.status(400).json({ message: "Provider not found." });
    }

    /* ---------------------------------
       3️⃣ Ensure customer location
    ---------------------------------- */
    // let customerCoords = address?.location?.coordinates;
    // if (
    //   !Array.isArray(customerCoords) ||
    //   customerCoords.length !== 2 ||
    //   (customerCoords[0] === 0 && customerCoords[1] === 0)
    // ) {
    //   const geoResult = await geocodeAddress(address);
    //   if (!geoResult) {
    //     return res.status(400).json({ message: "Unable to geocode address." });
    //   }
    //   customerCoords = [geoResult.lng, geoResult.lat];
    //   address.location = {
    //     type: "Point",
    //     coordinates: customerCoords,
    //   };
    // }
customerCoords = [-79.3832, 43.6532]; // Toronto coordinates
  address.location = {
    type: "Point",
    coordinates: customerCoords,
  };
    /* ---------------------------------
       4️⃣ Provider location check
       (THIS WILL NOW WORK)
    ---------------------------------- */
    const providerCoords =
      provider.providerProfile?.serviceAddress?.location?.coordinates;

    if (
      !Array.isArray(providerCoords) ||
      providerCoords.length !== 2 ||
      (providerCoords[0] === 0 && providerCoords[1] === 0)
    ) {
      return res.status(400).json({
        message: "Provider location is not configured.",
      });
    }

    /* ---------------------------------
       5️⃣ Distance + radius check
    ---------------------------------- */
    // const [providerLng, providerLat] = providerCoords;
    // const [customerLng, customerLat] = customerCoords;

    // const distanceMeters = haversine(
    //   { lat: providerLat, lng: providerLng },
    //   { lat: customerLat, lng: customerLng }
    // );

    // const distanceKm = distanceMeters / 1000;
    // const allowedRadius = provider.providerProfile?.serviceRadiusKm ?? 10;

    // if (distanceKm > allowedRadius) {
    //   return res.status(400).json({
    //     message: `Booking outside provider range (${distanceKm.toFixed(2)} km).`,
    //   });
    // }

    /* ---------------------------------
       6️⃣ Pricing
    ---------------------------------- */
    const totalPayable =
      service.priceUnit === "per_hour"
        ? service.basePrice * durationHours
        : service.basePrice;

    const pricingSnapshot = {
      currency: service.currency || "CAD",
      basePrice: service.basePrice,
      priceUnit: service.priceUnit,
      minHours: service.minHours,
      totalHours: durationHours,
      quotedSubtotal: totalPayable,
      discount: 0,
      totalPayable,
      platformCommission: totalPayable * 0.25,
      providerShare: totalPayable * 0.75,
    };

        // Add this cancellation policy snapshot
    const cancellationPolicySnapshot = {
      freeBeforeAcceptance: true,
      lateCancelFeePercent: 15,
    };

    
    /* ---------------------------------
       7️⃣ Create booking
    ---------------------------------- */
const otpCode = crypto.randomInt(100000, 999999).toString();

const booking = await Booking.create({
  customerId,
  providerId: provider._id,
  serviceId: service._id,
  categoryId: service.categoryId,

  status: "pending_payment",
  scheduledAt,
  durationHours,
  photos,

  serviceAddress: address,

  pricingSnapshot,

  // ✅ FIX: ADD THIS
  cancellationPolicySnapshot,

  payment: {
    status: "pending",
    currency: pricingSnapshot.currency,
  },

  completionOtp: {
    code: otpCode,
    verified: false,
  },

  notes,
  specialInstructions,

  autoExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
});

// Auto-create chat thread
await ChatThread.create({
  bookingId: booking._id,
  participants: [customerId, provider._id]
});


    const bookingObj = booking.toObject();
    delete bookingObj.completionOtp.code;

    return res.status(201).json({
      message: "Booking created successfully.",
      booking: bookingObj,
    });

  } catch (err) {
    console.error("❌ Booking creation error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};


exports.syncPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    const booking = await Booking.findOne({
      'payment.paymentIntentId': paymentIntentId
    });
    
    if (booking) {
      booking.payment.status = "succeeded";
      booking.status = "pending_provider_accept";
      await booking.save();
      
      return res.json({ message: "Payment synced", booking });
    }
    
    res.status(404).json({ message: "Booking not found" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// Get customer's bookings
exports.getCustomerBookings = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { 
      page = 1, 
      limit = 20, 
      status,
      startDate,
      endDate 
    } = req.query;
    
    const query = { customerId };
    if (status) query.status = status;
    
    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const bookings = await Booking.find(query)
      .populate('providerId', 'name email providerProfile.businessName')
      .populate('serviceId', 'title basePrice priceUnit')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-completionOtp.code'); // Hide OTP code
    
    const total = await Booking.countDocuments(query);
    
    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
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
      return res.status(400).json({ message: `Cannot complete booking in status: ${booking.status} status should in progress verify otp first` });
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
     paymentStatus: booking.payment?.status === "succeeded" ? "paid" : "pending",
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





// Get all bookings (Admin only)
exports.getAllBookings = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      customerId, 
      providerId, 
      serviceId,
      startDate,
      endDate 
    } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (customerId) query.customerId = customerId;
    if (providerId) query.providerId = providerId;
    if (serviceId) query.serviceId = serviceId;
    
    // Date range filter
    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const bookings = await Booking.find(query)
      .populate('customerId', 'name email')
      .populate('providerId', 'name email')
      .populate('serviceId', 'title basePrice')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Booking.countDocuments(query);
    
    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
  }
};

// Get booking statistics (Admin only)
exports.getBookingStats = async (req, res) => {
  try {
    const stats = await Booking.aggregate([
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: '$pricingSnapshot.totalPayable' },
          avgBookingValue: { $avg: '$pricingSnapshot.totalPayable' }
        }
      }
    ]);
    
    const statusStats = await Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const monthlyStats = await Booking.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$pricingSnapshot.totalPayable' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);
    
    res.json({
      success: true,
      data: {
        overview: stats[0] || {},
        byStatus: statusStats,
        monthly: monthlyStats
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get booking stats' });
  }
};

// Cancel booking (Admin only)
exports.adminCancelBooking = async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot cancel completed or already cancelled booking' 
      });
    }
    
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.adminCancellation = {
      reason: reason || 'Cancelled by admin',
      cancelledBy: req.user._id,
      cancelledAt: new Date()
    };
    
    await booking.save();
    
    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to cancel booking' });
  }
};

// Update booking status (Admin only)
exports.updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      'pending_payment', 'pending_provider_accept', 'accepted', 
      'in_progress', 'completed', 'cancelled'
    ];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        [`${status}At`]: new Date() // Dynamic field like completedAt, acceptedAt
      },
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    res.json({
      success: true,
      message: `Booking status updated to ${status}`,
      data: booking
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update booking status' });
  }
};

exports.processStripePayout = async (req, res) => {
  try {
    const booking = await Booking.findById("695cdcf978b829702029abcf");
    
    // Create a REAL test payout that shows in Stripe dashboard
    const payout = await stripe.payouts.create({
      amount: 18000, // $180 in cents  
      currency: 'usd', // Use USD since it's available by default
      method: 'instant', // Shows up immediately in dashboard
      metadata: {
        bookingId: booking._id.toString(),
        originalAmount: '180 CAD',
        providerPayout: 'true'
      }
    });
    
    // Update booking
    booking.payout.status = "released";
    booking.payout.transferId = payout.id;
    booking.payout.releasedAt = new Date();
    await booking.save();
    
    res.json({ 
      message: "Real test payout created!", 
      payoutId: payout.id,
      amount: "$180 USD",
      status: "paid",
      dashboardUrl: "https://dashboard.stripe.com/test/payouts",
      note: "Check your Stripe dashboard - payout should appear immediately!"
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//customer dashboatrd api

exports.getCustomerDashboard = async (req, res) => {
  try {
    const customerId = req.user._id;
    
    // Get booking statistics
    const stats = await Booking.aggregate([
      { $match: { customerId: new mongoose.Types.ObjectId(customerId) } },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          completedServices: { 
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } 
          },
          totalMoneySpent: { 
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$pricingSnapshot.totalPayable", 0] } 
          }
        }
      }
    ]);
    
    // Get recent bookings (last 5)
    const recentBookings = await Booking.find({ customerId })
      .populate('providerId', 'name profilePhoto')
      .populate('serviceId', 'title')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get favourite providers count (you'll need to create favourites model)
    const favouriteProvidersCount = 0; // TODO: Implement favourites
    
    const dashboardData = {
      totalBookings: stats[0]?.totalBookings || 0,
      completedServices: stats[0]?.completedServices || 0,
      totalMoneySpent: stats[0]?.totalMoneySpent || 0,
      favouriteProviders: favouriteProvidersCount,
      recentBookings
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
};

///provider dashboard

exports.getProviderDashboard = async (req, res) => {
  try {
    const providerId = req.user._id;
    
    // Get active services count
    const activeServices = await Service.countDocuments({ 
      providerId, 
      isActive: true 
    });
    
    // Get active bookings (accepted + in_progress)
    const activeBookings = await Booking.countDocuments({ 
      providerId,
      status: { $in: ["accepted", "in_progress"] }
    });
    
    // Get monthly earnings (current month completed bookings)
    const currentMonth = new Date();
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    
    const monthlyStats = await Booking.aggregate([
      {
        $match: {
          providerId: new mongoose.Types.ObjectId(providerId),
          status: "completed",
          completedAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          monthlyEarnings: { $sum: "$pricingSnapshot.providerShare" },
          totalTips: { $sum: "$tipSummary.totalTip" },
          completedBookings: { $sum: 1 }
        }
      }
    ]);
    
    // Calculate average rate from services
    const avgRateStats = await Service.aggregate([
      { $match: { providerId: new mongoose.Types.ObjectId(providerId) } },
      {
        $group: {
          _id: null,
          averageRate: { $avg: "$basePrice" }
        }
      }
    ]);
    
    // Get recent bookings (last 5)
    const recentBookings = await Booking.find({ providerId })
      .populate('customerId', 'name')
      .populate('serviceId', 'title')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);
    
    const monthlyData = monthlyStats[0] || {};
    const totalMonthlyEarnings = (monthlyData.monthlyEarnings || 0) + (monthlyData.totalTips || 0);
    
    const dashboardData = {
      activeServices,
      activeBookings,
      monthlyEarnings: totalMonthlyEarnings,
      providerShare: monthlyData.monthlyEarnings || 0,
      tips: monthlyData.totalTips || 0,
      averageRate: avgRateStats[0]?.averageRate || 0,
      completedThisMonth: monthlyData.completedBookings || 0,
      recentBookings
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch provider dashboard' });
  }
};



// Provider's bookings
exports.getProviderBookings = async (req, res) => {
  try {
    const providerId = req.user._id;
    const { page = 1, limit = 10, status } = req.query;
    
    const query = { providerId };
    if (status) query.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const bookings = await Booking.find(query)
      .populate('customerId', 'name email')
      .populate('serviceId', 'title basePrice')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json({ success: true, data: bookings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Provider earnings breakdown

exports.getProviderEarnings = async (req, res) => {
  try {
    const providerId = req.user._id;
    const { period = 'monthly' } = req.query; // weekly, monthly, yearly
    
    let groupBy, dateRange;
    const now = new Date();
    
    switch(period) {
      case 'weekly':
        groupBy = { 
          year: { $year: "$completedAt" },
          week: { $week: "$completedAt" }
        };
        dateRange = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000); // 12 weeks
        break;
      case 'yearly':
        groupBy = { year: { $year: "$completedAt" } };
        dateRange = new Date(now.getFullYear() - 3, 0, 1); // 3 years
        break;
      default: // monthly
        groupBy = { 
          year: { $year: "$completedAt" },
          month: { $month: "$completedAt" }
        };
        dateRange = new Date(now.getFullYear() - 1, now.getMonth(), 1); // 12 months
    }
    
    const earnings = await Booking.aggregate([
      {
        $match: {
          providerId: new mongoose.Types.ObjectId(providerId),
          status: "completed",
          completedAt: { $gte: dateRange }
        }
      },
      {
        $group: {
          _id: groupBy,
          earnings: { $sum: "$pricingSnapshot.providerShare" },
          tips: { $sum: "$tipSummary.totalTip" },
          bookings: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1, "_id.week": -1 } }
    ]);
    
    res.json({ success: true, data: earnings, period });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};







