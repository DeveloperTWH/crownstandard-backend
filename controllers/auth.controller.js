const crypto = require('crypto');
const { OAuth2Client } = require("google-auth-library");
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const { hashPassword, comparePassword } = require('../utils/passwords');
const { signJWT } = require('../utils/jwt');
const { sendEmail } = require('../utils/sendEmail');

const isProd = process.env.NODE_ENV === "production";

exports.register = async (req, res) => {
    try {
        const { name, email, phone, password, role = 'customer' } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Missing fields' });
        if (!["customer", "provider","admin"].includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role" });
        }
        const normalizedEmail = email.toLowerCase();

        const exists = await User.findOne({ email: normalizedEmail });
        if (exists) return res.status(409).json({ success: false, message: 'Email already in use' });

        const passwordHash = await hashPassword(password);
        const user = await User.create({
            name, email: normalizedEmail, phone, passwordHash, role,
            status: role === 'provider' ? 'pending' : 'active'
        });

        const token = signJWT({ id: user._id, role: user.role });
        return res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                role: user.role,
                name: user.name,
                email: user.email,
                profilePhoto: user.profilePhoto,
                status: user.status,
                oauthProvider: user.oauthProvider || null,
            },
        });
    } catch (e) { res.status(500).json({ success: false, message: 'Registration failed', error: e }); }
};

exports.login = async (req, res) => {
    try {
        const { email, password, role } = req.body;

        if (!email || !password || !role) {
            return res.status(400).json({ success: false, message: "Email, password, and role are required" });
        }

        const user = await User.findOne({ email: email.toLowerCase(), role });
        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid credentials or role" });
        }

        if (!user.passwordHash) {
            return res.status(400).json({ success: false, message: "Use social login for this account" });
        }

        const ok = await comparePassword(password, user.passwordHash);
        if (!ok) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // 🎟️ Generate JWT (safe fields only)
        const token = signJWT({ id: user._id, role: user.role });

        // 🍪 Set secure auth cookie
res.cookie("auth_token", token, {
  httpOnly: true,
  sameSite: "none",   // 👈 MUST be none for cross-domain
  secure: true,       // 👈 MUST be true on HTTPS
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

res.cookie("user_role", user.role, {
  httpOnly: false,
  sameSite: "none",
  secure: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

        res.cookie("user_id", user._id.toString(), {
            httpOnly: false, // readable by frontend
            sameSite: "strict",
            // sameSite: 'none',
            // domain: '.crownstandard.ca',
            secure: process.env.NODE_ENV === "production"
        });

        // 🧼 Return safe user info
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                role: user.role,
                name: user.name,
                email: user.email,
                profilePhoto: user.profilePhoto,
                status: user.status,
            },
        });
    } catch (e) {
        console.error("Login error:", e);
        res.status(500).json({ success: false, message: "Login failed" });
    }
};


exports.me = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select("-passwordHash -__v -resetTokens") // ✅ never return these
            .lean();
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, user: user });
    } catch (e) {
        res.status(500).json({ success: false, message: "Could not fetch user" });
    }
};


exports.updateMe = async (req, res) => {
    try {
        const allowed = [
            "name",
            "phone",
            "profilePhoto",
            "gender",
            "dateOfBirth",
            "customerProfile",
            "providerProfile",
        ];

        const patch = {};
        for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

        const user = await User.findByIdAndUpdate(req.user.id, patch, {
            new: true,
            runValidators: true, // ✅ ensures correct data type
            select: "-passwordHash -__v",
        });

        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        res.json({ success: true, user: user });
    } catch (e) {
        res.status(500).json({ success: false, message: "Update failed" });
    }
};

// Provider onboarding progress (registrationStepsCompleted, serviceAddress, etc.)
exports.updateProviderOnboarding = async (req, res) => {
    try {
        const { providerProfile = {} } = req.body;

        if (typeof providerProfile !== "object") {
            return res.status(400).json({ success: false, message: "Invalid providerProfile payload" });
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: { providerProfile } },
            { new: true, runValidators: true, select: "-passwordHash -__v" }
        );

        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        res.json({ success: true, user: user });
    } catch (e) {
        res.status(500).json({ success: false, message: "Onboarding update failed" });
    }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: "Email is required" });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.json({ success: false, ok: true }); // silent to avoid leaks

        const token = crypto.randomBytes(32).toString("hex");
        const ttl = parseInt(process.env.RESET_TOKEN_TTL_MIN || "30", 10);

        await PasswordResetToken.create({
            userId: user._id,
            token,
            expiresAt: new Date(Date.now() + ttl * 60 * 1000),
        });

        const link = `${process.env.CLIENT_BASE_URL}/reset-password?token=${token}`;
        await sendEmail({
            to: user.email,
            subject: "Reset your password",
            html: `Click <a href="${link}">here</a> to reset your password.`,
        });

        res.json({ success: true, ok: true });
    } catch (e) {
        res.status(500).json({ success: false, message: "Could not initiate reset" });
    }
};

// Reset password
exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword)
            return res.status(400).json({ success: false, message: "Token and new password are required" });

        const rec = await PasswordResetToken.findOne({ token });
        if (!rec || rec.usedAt || rec.expiresAt < new Date())
            return res.status(400).json({ success: false, message: "Invalid or expired token" });

        const user = await User.findById(rec.userId);
        if (!user) return res.status(400).json({ success: false, message: "Invalid token" });

        if (newPassword.length < 8)
            return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });

        user.passwordHash = await hashPassword(newPassword);
        await user.save();

        rec.usedAt = new Date();
        await rec.save();

        res.json({ success: true, ok: true });
    } catch (e) {
        res.status(500).json({ success: false, message: "Reset failed" });
    }
};

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// 📱 Google OAuth Login / Register
exports.oauthGoogle = async (req, res) => {
    try {
        const { idToken, role = "customer" } = req.body;
        if (!idToken) {
            return res.status(400).json({ success: false, message: "Missing Google ID token" });
        }

        // 🔎 Verify token with Google
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        const email = payload.email.toLowerCase();
        const name = payload.name;
        const picture = payload.picture;

        // 👤 Check if user already exists
        let user = await User.findOne({ email });

        if (!user) {
            // ✍️ New user → register
            user = await User.create({
                name,
                email,
                role,
                profilePhoto: picture,
                status: role === "provider" ? "pending" : "active",
                oauthProvider: "google",
            });
        } else {
            // 🔁 Existing user → update profile photo/name if changed
            let updated = false;
            if (picture && user.profilePhoto !== picture) {
                user.profilePhoto = picture;
                updated = true;
            }
            if (name && user.name !== name) {
                user.name = name;
                updated = true;
            }
            if (updated) await user.save();
        }

        // 🎟️ Sign a JWT with only safe data
        const token = signJWT({ id: user._id, role: user.role });

        // 🧼 Return only public fields
        res.json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                profilePhoto: user.profilePhoto,
                status: user.status,
                oauthProvider: user.oauthProvider,
            },
        });
    } catch (err) {
        console.error("Google OAuth error:", err);
        res.status(401).json({ success: false, message: "Invalid Google token" });
    }
};

