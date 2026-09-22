const mongoose = require('mongoose');

// Group ids and user ids are Strings in this project (group id = client id,
// user id = email), so these are Strings too - not ObjectIds.
const InviteSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true }, // sha256 of the token, never the token
    group: { type: String, required: true, index: true },
    invitedBy: { type: String, required: true }, // inviter's email
    type: { type: String, enum: ['qr', 'email'], required: true },
    email: { type: String, lowercase: true, trim: true }, // email invites only
    maxUses: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL cleanup
    status: { type: String, enum: ['active', 'used', 'revoked'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invite', InviteSchema);
