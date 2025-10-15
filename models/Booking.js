const mongoose = require("mongoose");
const { Schema } = mongoose;

const PhotoSchema = new Schema(
    {
        s3Key: { type: String, required: true },
        width: Number,
        height: Number,
        sizeBytes: Number,
        uploadedBy: {
            type: String,
            enum: ["customer", "provider", "system"],
            default: "customer",
        },
    },
    { _id: false }
);

const PricingSnapshotSchema = new Schema(
    {
        currency: { type: String, default: "USD", required: true },
        basePrice: { type: Number, required: true },
        priceUnit: { type: String, enum: ["per_hour", "per_service"], required: true },
        minHours: Number,
        totalHours: Number, // captured at booking time
        quotedSubtotal: Number,
        discount: { type: Number, default: 0 },
        totalPayable: { type: Number, required: true },
    },
    { _id: false }
);

const CancellationPolicySchema = new Schema(
    {
        freeBeforeAcceptance: { type: Boolean, default: true },
        lateCancelFeePercent: { type: Number, default: 15 },
    },
    { _id: false }
);

const BookingSchema = new Schema(
    {
        customerId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        providerId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        serviceId: {
            type: Schema.Types.ObjectId,
            ref: "Service",
            required: true,
            index: true,
        },
        categoryId: {
            type: Schema.Types.ObjectId,
            ref: "ServiceCategory",
            required: true,
            index: true,
        },

        status: {
            type: String,
            enum: [
                "pending_payment",
                "pending_provider_accept",
                "accepted",
                "in_progress",
                "completed",
                "cancelled",
                "auto_expired",
                "payment_failed",
            ],
            default: "pending_payment",
            index: true,
        },

        scheduledAt: { type: Date, required: true },

        // ✅ Total duration decided at booking time
        durationHours: { type: Number, required: true },

        // 🖼️ Photos uploaded by customer
        photos: [PhotoSchema],

        // 🏠 Where cleaning should happen
        serviceAddress: {
            line1: String,
            line2: String,
            city: String,
            state: String,
            country: String,
            postalCode: String,
            lat: Number,
            lng: Number,
        },

        // 💰 Snapshot of pricing at booking time
        pricingSnapshot: { type: PricingSnapshotSchema, required: true },

        // 📜 Snapshot of cancellation policy
        cancellationPolicySnapshot: { type: CancellationPolicySchema, required: true },

        // 💳 Payment details
        payment: {
            paymentIntentId: { type: String, index: true },
            status: {
                type: String,
                enum: ["pending", "succeeded", "failed", "refunded", "partial_refunded"],
                default: "pending",
            },
        },

        // 💸 Payout info
        payout: {
            status: {
                type: String,
                enum: ["pending", "on_hold", "released", "failed", "cancelled"],
                default: "pending",
                index: true,
            },
            transferId: String,
            holdReason: String,
            eligibleForReleaseAt: Date,
        },

        // 💲 Tip info
        tipSummary: {
            hasTip: { type: Boolean, default: false },
            totalTip: { type: Number, default: 0 },
            currency: { type: String, default: "USD", required: true }
        },

        // ✅ OTP verification for completion
        completionOtp: {
            code: { type: String }, // 4–6 digit OTP
            verified: { type: Boolean, default: false },
            verifiedAt: Date,
        },

        // 📅 Lifecycle timestamps
        autoExpireAt: { type: Date, index: true },
        acceptedAt: Date,
        completedAt: Date,
        cancelledAt: Date,

        // 💬 Optional fields
        chatThreadId: { type: Schema.Types.ObjectId, ref: "ChatThread" },
        notes: String,
        specialInstructions: String,
    },
    { timestamps: true }
);

// ✅ Useful indexes
BookingSchema.index({ providerId: 1, scheduledAt: 1 });
BookingSchema.index({ customerId: 1, scheduledAt: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ autoExpireAt: 1 });

const Booking = mongoose.model("Booking", BookingSchema);
module.exports = Booking;