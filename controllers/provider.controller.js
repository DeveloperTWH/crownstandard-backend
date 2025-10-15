const User = require("../models/User");

// ✅ Helper: same function we used in service controller
async function validateProviderReadiness(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error("User not found");

  if (user.role !== "provider") throw new Error("Only providers can perform this action");
  if (user.status !== "active") throw new Error("Your account is not active");
  if (user.providerProfile?.approvalStatus !== "approved") throw new Error("Your provider profile is not approved");
  if (!user.providerProfile?.kyc?.verified) throw new Error("KYC verification required before creating services");
  if (!user.emailVerified) throw new Error("Please verify your email before continuing");
  if (!user.phoneVerified) throw new Error("Please verify your phone number before continuing");
  if (!user.providerProfile?.serviceAddress) throw new Error("Please complete your provider profile before listing services");

  return user;
}

// 📊 Provider readiness check API
exports.checkReadiness = async (req, res) => {
  try {
    const user = await validateProviderReadiness(req.user.id);

    res.json({
      success: true,
      message: "Provider account is ready to create services 🚀",
      provider: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.providerProfile?.approvalStatus,
        kycVerified: user.providerProfile?.kyc?.verified,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        serviceAddress: user.providerProfile?.serviceAddress,
      },
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
