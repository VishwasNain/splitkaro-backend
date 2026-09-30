// utils/token.js
// Signs and verifies the login token (JWT) the app sends on every sync call.

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('JWT_SECRET is missing or too short (use 32+ characters). Add it to .env and to Render.');
}

const TOKEN_LIFETIME = '30d';

exports.signToken = (email) => jwt.sign({ sub: email }, SECRET, { expiresIn: TOKEN_LIFETIME });
exports.verifyToken = (token) => jwt.verify(token, SECRET);

// Short-lived link token so the phone can open a bill file (PDF viewer / <Image>)
// without being able to send an Authorization header.
exports.signFileToken = (billId, userId) =>
  jwt.sign({ purpose: 'billfile', bill: billId, sub: userId }, SECRET, { expiresIn: '10m' });
exports.verifyFileToken = (token, billId) => {
  const p = jwt.verify(token, SECRET);
  if (p.purpose !== 'billfile' || p.bill !== billId) throw new Error('bad file token');
  return p;
};
