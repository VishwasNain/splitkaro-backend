// controllers/otpController.js
//
// DEV MODE ONLY. There's no SMS provider wired up here - sending real SMS to
// Indian numbers requires DLT template registration with TRAI first (a business
// registration process, not a code change), so for now this generates a code,
// logs it server-side, AND returns it in the response so the app can show it
// directly instead of waiting for a text that will never arrive.
//
// Swap this out before launch: replace the console.log + "code" in the response
// with a real call to your SMS provider (MSG91, Twilio, etc.) once DLT is done -
// the request/response shape below can stay the same either way, so the app
// doesn't need to change when you make that swap.

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory is fine here - OTPs are short-lived and losing them on a server
// restart just means the user requests a fresh one, no real data lost.
const otpStore = new Map(); // phone -> { code, expiresAt }

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'phone is required' });
    }

    const code = generateCode();
    otpStore.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS });

    console.log(`[DEV OTP] ${phone} -> ${code} (expires in 5 min, no real SMS sent)`);

    res.json({ success: true, devMode: true, code });
  } catch (e) {
    console.error('sendOtp error', e);
    res.status(500).json({ success: false, message: 'Could not generate OTP' });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ success: false, message: 'phone and code are required' });
    }

    const entry = otpStore.get(phone);
    if (!entry) {
      return res.status(400).json({ success: false, message: 'No OTP requested for this number yet' });
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({ success: false, message: 'That code expired - request a new one' });
    }
    if (entry.code !== String(code).trim()) {
      return res.status(400).json({ success: false, message: 'Incorrect code' });
    }

    otpStore.delete(phone);
    res.json({ success: true });
  } catch (e) {
    console.error('verifyOtp error', e);
    res.status(500).json({ success: false, message: 'Could not verify OTP' });
  }
};

module.exports = { sendOtp, verifyOtp };