const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const InviteSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  group:     { type: ObjectId, ref: 'Group', required: true, index: true },
  invitedBy: { type: ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: ['qr', 'email'], required: true },
  email:     { type: String, lowercase: true, trim: true },
  maxUses:   { type: Number, default: 1 },
  usedCount: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  status:    { type: String, enum: ['active', 'used', 'revoked'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('Invite', InviteSchema);
