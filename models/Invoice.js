const mongoose = require("mongoose");
const { Schema } = mongoose;

const InvoiceSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    paymentTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTransaction",
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    issuedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    amount: Number,
    tax: Number,
    total: Number,
    pdfUrl: String,
    status: {
      type: String,
      enum: ["issued", "paid", "cancelled"],
      default: "issued",
    },
  },
  { timestamps: true }
);

InvoiceSchema.index({ invoiceNumber: 1 });
InvoiceSchema.index({ bookingId: 1 });

module.exports = mongoose.model("Invoice", InvoiceSchema);
