const mongoose = require("mongoose");
const { Schema } = mongoose;

// ✅ GeoAddress sub-schema
const GeoAddressSchema = new Schema(
  {
    line1: { type: String, required: true },
    line2: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
  },
  { _id: false }
);
GeoAddressSchema.index({ location: "2dsphere" });

// ✅ KYC sub-schema
const KycSchema = new Schema(
  {
    documentType: String,
    documentUrl: String,
    verified: { type: Boolean, default: false },
  },
  { _id: false }
);

// ✅ Payout info sub-schema
const PayoutInfoSchema = new Schema(
  {
    stripeAccountId: String,
    bankName: String,
    accountNumber: String,
    accountHolderName: String,
  },
  { _id: false }
);

// ✅ Provider Profile
const ProviderProfileSchema = new Schema(
  {
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "complete_registration"],
      default: "pending",
    },
    serviceAddress: GeoAddressSchema,
    serviceRadiusKm: { type: Number, default: 10 },
    kyc: KycSchema,
    payoutInfo: PayoutInfoSchema,
    totalEarnings: { type: Number, default: 0 },
    blockedDates: [{ type: Date }],
    documents: [
      {
        type: { type: String },
        s3Url: String,
        verified: Boolean,
      },
    ],
    averageRating: { type: Number, default: 0 },
    registrationStepsCompleted: { type: Number, default: 0 },
  },
  { _id: false }
);

// ✅ Customer Profile
const CustomerProfileSchema = new Schema(
  {
    defaultAddress: GeoAddressSchema,
    savedAddresses: [GeoAddressSchema],
  },
  { _id: false }
);

// ✅ OAuth Provider Schema
const OAuthSchema = new Schema(
  {
    provider: { type: String, enum: ["google", "apple"] },
    providerId: String,
    email: String,
  },
  { _id: false }
);

// ✅ Main User Schema
const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, index: true },
    passwordHash: String, // required if not using OAuth
    loginProviders: [OAuthSchema], // for Google/Apple sign-in

    role: {
      type: String,
      enum: ["admin", "provider", "customer"],
      required: true,
      default: "customer",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "pending", "suspended"],
      default: "pending",
    },

    profilePhoto: String,
    gender: { type: String, enum: ["male", "female", "other"] },
    dateOfBirth: Date,

    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },

    providerProfile: ProviderProfileSchema,
    customerProfile: CustomerProfileSchema,

    lastLoginAt: Date,
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);


// ✅ Pre hooks (optional - set lastLoginAt automatically)
UserSchema.methods.markLogin = async function () {
  this.lastLoginAt = new Date();
  await this.save();
};

const User = mongoose.model("User", UserSchema);
module.exports = User;
