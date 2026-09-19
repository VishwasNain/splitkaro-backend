// utils/setupTokens.js
// Short-lived, single-use tokens that prove "this person just verified the
// email OTP", so they're allowed to set/reset a password. In-memory like the
// OTP store (move to Redis/DB if you run multiple server instances).

const crypto = require('crypto');

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const store = new Map(); // email -> { token, expiresAt }

function issue(email) {
  const token = crypto.randomBytes(32).toString('hex');
  store.set(email, { token, expiresAt: Date.now() + TTL_MS });
  return token;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Returns true if the token is valid for this email. Does NOT consume it -
// call consume() after the password has actually been saved.
function isValid(email, token) {
  const rec = store.get(email);
  if (!rec || typeof token !== 'string') return false;
  if (Date.now() > rec.expiresAt) {
    store.delete(email);
    return false;
  }
  return safeEqual(rec.token, token);
}

function consume(email) {
  store.delete(email);
}

module.exports = { issue, isValid, consume };
