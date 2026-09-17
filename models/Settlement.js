const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema(
  {
    _id: { type: String },
    groupId: String,
    from: String,
    to: String,
    amount: Number,
    date: String,
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('Settlement', settlementSchema);
