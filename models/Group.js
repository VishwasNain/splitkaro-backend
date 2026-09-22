const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
  },
  { _id: false }
);

// _id is a String here (not the default ObjectId) so it can directly reuse the
// client-generated id (e.g. "grp_1699999999_12345") - this keeps client and
// server perfectly in sync without any id-remapping logic.
const groupSchema = new mongoose.Schema(
  {
    _id: { type: String },
    ownerId: { type: String, required: true, index: true }, // the creator's email
    // Emails of accounts that JOINED through an invite. Only the server writes this
    // (invite accept); the app can never set it. Together with ownerId it decides
    // who is allowed to see this group and its expenses.
    memberAccounts: { type: [String], default: [], index: true },
    name: String,
    category: String,
    icon: String,
    color: String,
    members: [memberSchema],
    // Named isNewGroup internally - "isNew" is a reserved Mongoose document
    // property, so reusing it as a schema field risks colliding with Mongoose's
    // own internals. Transformed back to "isNew" below so the client is unaffected.
    isNewGroup: Boolean,
    createdAt: String,
    // Soft delete: keeps a tombstone so a stale device can't re-create a deleted group.
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        ret.isNew = ret.isNewGroup;
        delete ret._id;
        delete ret.isNewGroup;
        delete ret.__v;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('Group', groupSchema);
