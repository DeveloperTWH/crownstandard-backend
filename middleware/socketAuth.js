// path/to/middleware/socketAuth.js

const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Adjust path to your User model
const cookie = require('cookie'); 

module.exports = async function socketAuthMiddleware(socket, next) {
    try {
        const rawCookies = socket.handshake.headers.cookie;

        if (!rawCookies) {
            return next(new Error("Unauthorized: No token provided."));
        }

        const parsedCookies = cookie.parse(rawCookies);
        const token = parsedCookies.auth_token; // Assumes your cookie name is 'auth_token'

        if (!token) {
            return next(new Error("Unauthorized: 'auth_token' cookie missing."));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.sub).select('_id isDeleted');

        if (!user || user.isDeleted) {
            return next(new Error("Unauthorized: User not found or deleted."));
        }

        // 🔥 CRITICAL: Attach the verified userId to the socket object
        socket.userId = user._id.toString(); 
        
        return next();

    } catch (err) {
        console.error("Socket Auth Error:", err.message);
        return next(new Error("Authentication failed: Invalid or expired token."));
    }
};