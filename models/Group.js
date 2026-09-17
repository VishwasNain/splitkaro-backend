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
