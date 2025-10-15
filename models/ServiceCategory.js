const mongoose = require("mongoose");
const { Schema } = mongoose;

const ServiceCategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// For quick text search by name or slug
ServiceCategorySchema.index({ name: "text", slug: 1 });

const ServiceCategory = mongoose.model("ServiceCategory", ServiceCategorySchema);
module.exports = ServiceCategory;
