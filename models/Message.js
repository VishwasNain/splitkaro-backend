const mongoose = require('mongoose');

// senderId is the account email (like ownerId elsewhere) - never sent to other
// members directly. Output is remapped to 'you' / an opaque id + display name,
// same pattern as utils/identity.js uses for groups and expenses.
const messageSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    text: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ groupId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
