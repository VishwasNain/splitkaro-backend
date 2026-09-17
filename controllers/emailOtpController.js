// controllers/emailOtpController.js
// Generates + verifies email OTPs using Brevo's transactional email API.
// No Firebase, no SMS provider — pure email + in-memory store (swap for Redis/DB later if you scale).

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL; // vishwasnian24@gmail.com

// In-memory store: { email: { code, expiresAt } }
// Fine for single-instance dev/small deployments. Move to Redis if you scale to multiple server instances.
const otpStore = new Map();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_LENGTH = 6;

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
}

async function sendBrevoEmail(toEmail, code) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: "App" },
      to: [{ email: toEmail }],
      subject: "Your verification code",
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

// POST /api/otp/send-email
// body: { email }
exports.sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }

    const code = generateCode();
    const expiresAt = Date.now() + OTP_TTL_MS;

    otpStore.set(email.toLowerCase(), { code, expiresAt });

    await sendBrevoEmail(email, code);

    return res.status(200).json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    console.error("sendEmailOtp error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

// POST /api/otp/verify-email
// body: { email, code }
exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, message: "Email and code are required" });
    }

    const key = email.toLowerCase();
    const record = otpStore.get(key);

    if (!record) {
      return res.status(400).json({ success: false, message: "No OTP found for this email. Request a new one." });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ success: false, message: "Code expired. Request a new one." });
    }

    if (record.code !== String(code).trim()) {
      return res.status(400).json({ success: false, message: "Incorrect code" });
    }

    // Success — clear it so it can't be reused
    otpStore.delete(key);

    // TODO: look up or create the user record here, issue your session/JWT the same way
    // your old phone-OTP flow did, so downstream screens don't need to change.

    return res.status(200).json({ success: true, message: "Email verified" });
  } catch (err) {
    console.error("verifyEmailOtp error:", err.message);
    return res.status(500).json({ success: false, message: "Verification failed" });
  }
};