const mongoose = require('mongoose');

// Each user is their own account now, keyed by email (from email-OTP or Google
// sign-in) instead of the old fixed 'you' id. One document per real person.
const userSchema = new mongoose.Schema(
  {
    _id: { type: String }, // email, lowercased
    name: { type: String, default: 'You' },
    phone: { type: String, default: '' },
    // bcrypt hash. select:false => never returned unless explicitly requested
    // (only the login route does that), and toJSON strips it as a second guard.
    passwordHash: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('User', userSchema);