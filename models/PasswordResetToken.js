const mongoose = require('mongoose');
const { Schema } = mongoose;

const PasswordResetTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  token: { type: String, required: true, index: true }, // random string
  expiresAt: { type: Date, required: true, index: true },
  usedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
