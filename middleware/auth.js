const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || user.isDeleted) return res.status(401).json({ message: 'Unauthorized' });

    req.user = { id: user._id, role: user.role };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
