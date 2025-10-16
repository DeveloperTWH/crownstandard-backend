const mongoose = require("mongoose");
const { Schema } = mongoose;

const LineItemSchema = new Schema(
  {
    description: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, default: 1 },
    total: { type: Number, required: true }, // unitPrice * quantity
  },
  { _id: false }
);

const InvoiceSchema = new Schema(
  {
    // 📦 References
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    paymentTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTransaction",
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    issuedTo: {
      type: Schema.Types.ObjectId,
      ref: "User", // Customer
      required: true,
    },
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // Platform or Provider
    },

    // 💰 Amount breakdown
    currency: { type: String, default: "USD", required: true },
    lineItems: [LineItemSchema], // detailed breakdown

    subtotal: { type: Number, required: true }, // before tax
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true }, // subtotal + tax

    // 📅 Lifecycle
    issuedDate: { type: Date, default: Date.now },
    dueDate: Date,

    // 📜 Invoice status
    status: {
      type: String,
      enum: ["issued", "cancelled"],
      default: "issued",
      index: true,
    },

    // 💳 Payment status (separate from invoice state)
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "partial_refunded"],
      default: "pending",
      index: true,
    },

    // 📁 PDF and external references
    pdfUrl: String,

    // 🪵 Additional info
    metadata: {
      type: Map,
      of: String,
    },
  },
  { timestamps: true }
);

// ✅ Useful indexes
InvoiceSchema.index({ invoiceNumber: 1 });
InvoiceSchema.index({ bookingId: 1 });
InvoiceSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model("Invoice", InvoiceSchema);