const User = require('../models/User');

exports.getUser = async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) return res.status(404).json({ message: 'Not found' });
  delete user.passwordHash;
  res.json({ user });
};

exports.approveProvider = async (req, res) => {
  const { approvalStatus = 'approved' } = req.body;
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { 'providerProfile.approvalStatus': approvalStatus, status: approvalStatus==='approved'?'active':'pending' } },
    { new: true }
  );
  res.json({ user });
};

exports.setUserStatus = async (req, res) => {
  const { status } = req.body; // active | suspended | pending
  const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
  res.json({ user });
};


//for admin
exports.getAllUsers = async (req, res) => {
  try {
    const { role, status, page = 1, limit = 20, search } = req.query;
    
    const query = { isDeleted: { $ne: true } };
    
    // Filter by role
    if (role) query.role = role;
    
    // Filter by status  
    if (status) query.status = status;
    
    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};
