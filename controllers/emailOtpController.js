// controllers/emailOtpController.js
// Generates + verifies email OTPs using Brevo's transactional email API.
// In-memory store (swap for Redis/DB if you ever run multiple server instances).

const crypto = require('crypto');
const User = require('../models/User');
const setupTokens = require('../utils/setupTokens');
const { signToken } = require('../utils/token');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;

// { email: { code, expiresAt, attempts, sentAt } }
const otpStore = new Map();

const OTP_TTL_MS = 5 * 60 * 1000; // code valid for 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between codes
const MAX_ATTEMPTS = 5; // wrong guesses allowed per code

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString(); // 6 digits, cryptographically secure
}

async function sendBrevoEmail(toEmail, code) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: 'Splitkaro' },
      to: [{ email: toEmail }],
      subject: 'Your verification code',
      htmlContent: `
        <div style="font-family: sans-serif; padding: 24px;">
          <h2>Your verification code</h2>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">${code}</p>
          <p>This code expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Brevo send failed: ${response.status} ${errBody}`);
  }

  return response.json();
}

// POST /api/auth/otp/send-email
// body: { email }
exports.sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body || {};

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }

    const key = email.toLowerCase().trim();

    const prev = otpStore.get(key);
    if (prev && Date.now() - prev.sentAt < RESEND_COOLDOWN_MS) {
      return res.status(429).json({
        success: false,
        message: 'Please wait a minute before requesting another code.',
      });
    }

    const code = generateCode();
    otpStore.set(key, {
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      sentAt: Date.now(),
    });

    try {
      await sendBrevoEmail(key, code);
    } catch (err) {
      otpStore.delete(key); // don't make the user wait a minute after a failed send
      throw err;
    }

    return res.status(200).json({ success: true, message: 'OTP sent to email' });
  } catch (err) {
    console.error('sendEmailOtp error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

// POST /api/auth/otp/verify-email
// body: { email, code }
exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, code } = req.body || {};

    if (!email || !code || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Email and code are required' });
    }

    const key = email.toLowerCase().trim();
    const record = otpStore.get(key);

    if (!record) {
      return res.status(400).json({ success: false, message: 'No OTP found for this email. Request a new one.' });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ success: false, message: 'Code expired. Request a new one.' });
    }

    if (record.code !== String(code).trim()) {
      record.attempts += 1;
      if (record.attempts >= MAX_ATTEMPTS) {
        otpStore.delete(key);
        return res.status(400).json({ success: false, message: 'Too many wrong attempts. Request a new code.' });
      }
      return res.status(400).json({ success: false, message: 'Incorrect code' });
    }

    // Success - clear it so it can't be reused
    otpStore.delete(key);

    // Find-or-create the account (the email is the account id).
    const user = await User.findByIdAndUpdate(
      key,
      {},
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Tell the app whether this account already has a password, and hand back a
    // short-lived single-use token that authorizes POST /api/auth/set-password.
    const hasPassword = !!(await User.exists({ _id: key, passwordHash: { $type: 'string' } }));
    const setupToken = setupTokens.issue(key);

    return res.status(200).json({
      success: true,
      message: 'Email verified',
      user,
      hasPassword,
      setupToken,
      token: signToken(key), // login token for the sync API
    });
  } catch (err) {
    console.error('verifyEmailOtp error:', err.message);
    return res.status(500).json({ success: false, message: 'Verification failed' });
  }
};