// middleware/requireUser.js
// Sync routes need to know WHICH account is calling. The app sends the JWT it
// received at login as:  Authorization: Bearer <token>
// The server verifies the signature, so a caller can no longer pretend to be
// someone else just by knowing their email.
//
// Guests (never logged in) send no token, get 401, and the app keeps working
// in local-only mode.

const { verifyToken } = require('../utils/token');

function requireUser(req, res, next) {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Login required' });
  }

  try {
    req.userId = String(verifyToken(token).sub).toLowerCase().trim();
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireUser;
