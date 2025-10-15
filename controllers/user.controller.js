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
