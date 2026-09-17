const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    id: String,
    text: String,
    createdAt: String,
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    _id: { type: String },
    groupId: String,
    description: String,
    category: String,
    amount: Number,
    paidBy: String,
    splitType: String,
    // Plain object of { memberId: shareAmount } - Mixed so it passes through
    // exactly as the client sends it, no Map serialization headaches.
    shares: { type: mongoose.Schema.Types.Mixed, default: {} },
    date: String,
    comments: [commentSchema],
    // Set on settlement expenses created via addSettlement() in AppContext.js.
    // Without this, Mongoose's default strict mode silently drops the field
    // on insertMany since it wasn't declared - no error, just quietly lost.
    isSettlement: { type: Boolean, default: false },
    createdAt: String,
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

module.exports = mongoose.model('Expense', expenseSchema);