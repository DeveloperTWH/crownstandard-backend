const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function auth(req, res, next) {
  try {
    // Get token stored in cookie by your login API
    const token = req.cookies?.auth_token;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No token" });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user
    const user = await User.findById(decoded.sub);
    if (!user || user.isDeleted) {
      // clear invalid cookie
      res.clearCookie("auth_token");
      res.clearCookie("user_role");

      return res.status(401).json({ message: "Unauthorized User Removed" });
    }

    // Attach user to request
    req.user = {
      _id: user._id,
      role: user.role
    };

    return next();

  } catch (err) {

    // If token expired → delete cookies instantly
    if (err.name === "TokenExpiredError") {
      res.clearCookie("auth_token");
      res.clearCookie("user_role");
      return res.status(401).json({ message: "Session expired, login required" });
    }

    // Any other token issue
    res.clearCookie("auth_token");
    res.clearCookie("user_role");
    return res.status(401).json({ message: "Invalid token" });
  }
};
