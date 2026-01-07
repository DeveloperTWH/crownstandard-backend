const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const ServiceCategory = require('../models/ServiceCategory');
const PaymentTransaction = require('../models/PaymentTransaction');

// Admin Dashboard Overview
exports.getDashboardStats = async (req, res) => {
  try {
    // User counts
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalUsers = await User.countDocuments({ isDeleted: { $ne: true } });
    const activeUsers = await User.countDocuments({ status: 'active', isDeleted: { $ne: true } });
    const pendingProviders = await User.countDocuments({ 
      role: 'provider', 
      'providerProfile.approvalStatus': 'pending' 
    });

    // Service stats
    const totalServices = await Service.countDocuments();
    const activeServices = await Service.countDocuments({ isActive: true, isVisible: true });
    const pendingServices = await Service.countDocuments({ isVisible: false });

    // Booking stats
    const totalBookings = await Booking.countDocuments();
    const completedBookings = await Booking.countDocuments({ status: 'completed' });
    const pendingBookings = await Booking.countDocuments({ 
      status: { $in: ['pending_payment', 'pending_provider_accept', 'accepted'] }
    });

    // Revenue stats
    const revenueStats = await Booking.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricingSnapshot.totalPayable' },
          platformRevenue: { $sum: '$pricingSnapshot.platformCommission' },
          avgBookingValue: { $avg: '$pricingSnapshot.totalPayable' }
        }
      }
    ]);

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    const recentBookings = await Booking.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          pendingProviders,
          byRole: userStats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {})
        },
        services: {
          total: totalServices,
          active: activeServices,
          pending: pendingServices
        },
        bookings: {
          total: totalBookings,
          completed: completedBookings,
          pending: pendingBookings
        },
        revenue: revenueStats[0] || {
          totalRevenue: 0,
          platformRevenue: 0,
          avgBookingValue: 0
        },
        recentActivity: {
          newUsers: recentUsers,
          newBookings: recentBookings
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get dashboard stats' });
  }
};

// Monthly Analytics
exports.getMonthlyAnalytics = async (req, res) => {
  try {
    const { months = 12 } = req.query;
    
    // Monthly user registrations
    const userGrowth = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: parseInt(months) }
    ]);

    // Monthly bookings
    const bookingTrends = await Booking.aggregate([
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
      { $limit: parseInt(months) }
    ]);

    // Top categories
    const topCategories = await Booking.aggregate([
      {
        $group: {
          _id: '$categoryId',
          bookings: { $sum: 1 },
          revenue: { $sum: '$pricingSnapshot.totalPayable' }
        }
      },
      {
        $lookup: {
          from: 'servicecategories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      { $sort: { bookings: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      data: {
        userGrowth,
        bookingTrends,
        topCategories
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get analytics' });
  }
};

// Recent Activities
exports.getRecentActivities = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Recent users
    const recentUsers = await User.find({ isDeleted: { $ne: true } })
      .select('name email role createdAt')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) / 2);

    // Recent bookings
    const recentBookings = await Booking.find()
      .populate('customerId', 'name email')
      .populate('serviceId', 'title')
      .select('status scheduledAt createdAt pricingSnapshot.totalPayable')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) / 2);

    res.json({
      success: true,
      data: {
        recentUsers,
        recentBookings
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get recent activities' });
  }
};

// System Health
exports.getSystemHealth = async (req, res) => {
  try {
    const dbStats = {
      users: await User.countDocuments(),
      services: await Service.countDocuments(),
      bookings: await Booking.countDocuments(),
      categories: await ServiceCategory.countDocuments()
    };

    // Check for issues
    const issues = [];
    
    const pendingProviders = await User.countDocuments({ 
      role: 'provider', 
      'providerProfile.approvalStatus': 'pending' 
    });
    if (pendingProviders > 0) {
      issues.push(`${pendingProviders} providers awaiting approval`);
    }

    const failedPayments = await Booking.countDocuments({ 
      status: 'payment_failed' 
    });
    if (failedPayments > 0) {
      issues.push(`${failedPayments} failed payments`);
    }

    res.json({
      success: true,
      data: {
        status: 'healthy',
        dbStats,
        issues,
        lastChecked: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      data: { status: 'error', error: err.message }
    });
  }
};
