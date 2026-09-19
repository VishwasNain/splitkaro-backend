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