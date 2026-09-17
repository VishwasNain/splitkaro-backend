const mongoose = require('mongoose');

// Single-user app for now, so this collection will only ever hold one document
// with a fixed id ('you'), matching the app's local user object.
const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'you' },
    name: { type: String, default: 'You' },
    phone: { type: String, default: '' },
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

module.exports = mongoose.model('User', userSchema);
