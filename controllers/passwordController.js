// controllers/passwordController.js
// Password login + first-time password setup (and reset via email OTP).
//
// Flow:
//   1. New user:  send-email -> verify-email (returns setupToken) -> set-password
//   2. Later:     POST /api/auth/login { email, password }   (no OTP needed)
//   3. Forgot:    same as (1) - the OTP proves email ownership, then set a new password

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const setupTokens = require('../utils/setupTokens');

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything past 72 bytes

// Used to keep response time similar when the email doesn't exist / has no
// password, so login timing doesn't reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// Failed-login lockout (per email). In-memory; fine for a single instance.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map(); // email -> { count, lockedUntil }

function lockedFor(key) {
  const f = failures.get(key);
  if (f && f.lockedUntil && Date.now() < f.lockedUntil) return f.lockedUntil - Date.now();
  return 0;
}

function registerFailure(key) {
  const f = failures.get(key) || { count: 0, lockedUntil: 0 };
  if (f.lockedUntil && Date.now() >= f.lockedUntil) {
    f.count = 0;
    f.lockedUntil = 0;
  }
  f.count += 1;
  if (f.count >= MAX_FAILURES) f.lockedUntil = Date.now() + LOCK_MS;
  failures.set(key, f);
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.toLowerCase().trim() : '';
}

// POST /api/auth/set-password
// body: { email, password, setupToken }   (setupToken comes from verify-email)
exports.setPassword = async (req, res) => {
  try {
    const { email, password, setupToken } = req.body || {};
    const key = normalizeEmail(email);

    if (!key || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }
    if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
      return res.status(400).json({ success: false, message: 'Password is too long (max 72 characters)' });
    }
    if (!setupTokens.isValid(key, setupToken)) {
      return res.status(401).json({
        success: false,
        message: 'Your verification expired. Please request a new code.',
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.findByIdAndUpdate(
      key,
      { passwordHash },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    setupTokens.consume(key);
    failures.delete(key); // resetting the password also clears any lockout

    return res.status(200).json({ success: true, message: 'Password set', user });
  } catch (err) {
    console.error('setPassword error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not set password' });
  }
};

// POST /api/auth/login
// body: { email, password }
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const key = normalizeEmail(email);

    if (!key || typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const wait = lockedFor(key);
    if (wait > 0) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${Math.ceil(wait / 60000)} min, or use "Forgot password".`,
      });
    }

    const user = await User.findById(key).select('+passwordHash');
    const hash = user && user.passwordHash ? user.passwordHash : DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash);

    if (!user || !user.passwordHash || !ok) {
      registerFailure(key);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    failures.delete(key);
    return res.stat// controllers/passwordController.js
// Password login + first-time password setup (and reset via email OTP).
//
// Flow:
//   1. New user:  send-email -> verify-email (returns setupToken) -> set-password
//   2. Later:     POST /api/auth/login { email, password }   (no OTP needed)
//   3. Forgot:    same as (1) - the OTP proves email ownership, then set a new password

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const setupTokens = require('../utils/setupTokens');
const { signToken } = require('../utils/token');

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything past 72 bytes

// Used to keep response time similar when the email doesn't exist / has no
// password, so login timing doesn't reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// Failed-login lockout (per email). In-memory; fine for a single instance.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map(); // email -> { count, lockedUntil }

function lockedFor(key) {
  const f = failures.get(key);
  if (f && f.lockedUntil && Date.now() < f.lockedUntil) return f.lockedUntil - Date.now();
  return 0;
}

function registerFailure(key) {
  const f = failures.get(key) || { count: 0, lockedUntil: 0 };
  if (f.lockedUntil && Date.now() >= f.lockedUntil) {
    f.count = 0;
    f.lockedUntil = 0;
  }
  f.count += 1;
  if (f.count >= MAX_FAILURES) f.lockedUntil = Date.now() + LOCK_MS;
  failures.set(key, f);
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.toLowerCase().trim() : '';
}

// POST /api/auth/set-password
// body: { email, password, setupToken }   (setupToken comes from verify-email)
exports.setPassword = async (req, res) => {
  try {
    const { email, password, setupToken } = req.body || {};
    const key = normalizeEmail(email);

    if (!key || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }
    if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
      return res.status(400).json({ success: false, message: 'Password is too long (max 72 characters)' });
    }
    if (!setupTokens.isValid(key, setupToken)) {
      return res.status(401).json({
        success: false,
        message: 'Your verification expired. Please request a new code.',
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.findByIdAndUpdate(
      key,
      { passwordHash },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    setupTokens.consume(key);
    failures.delete(key); // resetting the password also clears any lockout

    return res.status(200).json({ success: true, message: 'Password set', user, token: signToken(key) });
  } catch (err) {
    console.error('setPassword error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not set password' });
  }
};

// POST /api/auth/login
// body: { email, password }
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const key = normalizeEmail(email);

    if (!key || typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const wait = lockedFor(key);
    if (wait > 0) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${Math.ceil(wait / 60000)} min, or use "Forgot password".`,
      });
    }

    const user = await User.findById(key).select('+passwordHash');
    const hash = user && user.passwordHash ? user.passwordHash : DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash);

    if (!user || !user.passwordHash || !ok) {
      registerFailure(key);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    failures.delete(key);
    return res.status(200).json({ success: true, message: 'Logged in', user, token: signToken(key) });
  } catch (err) {
    console.error('login error:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
};us(200).json({ success: true, message: 'Logged in', user });
  } catch (err) {
    console.error('login error:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
};
