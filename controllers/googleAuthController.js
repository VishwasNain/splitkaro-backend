// controllers/googleAuthController.js
// Verifies the Google ID token sent from the app after @react-native-google-signin/google-signin
// completes on-device sign-in. No Firebase involved — uses Google's own token-info endpoint.

const { OAuth2Client } = require("google-auth-library");
const User = require('../models/User');
const { signToken } = require('../utils/token');

const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID; // the "Web application" client ID
const client = new OAuth2Client(GOOGLE_WEB_CLIENT_ID);

// POST /api/auth/google
// body: { idToken }   <- comes from GoogleSignin.signIn() on the frontend
exports.googleSignIn = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: "idToken is required" });
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_WEB_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    // payload contains: email, email_verified, name, picture, sub (Google user id), etc.

    if (!payload || !payload.email_verified) {
      return res.status(401).json({ success: false, message: "Google account email not verified" });
    }

    // Same account model as email OTP: email is the id. Find-or-create the
    // User document (using their Google display name if this is a first login).
    const key = payload.email.toLowerCase();
    const user = await User.findByIdAndUpdate(
      key,
      { $setOnInsert: { name: payload.name || 'You' } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Google sign-in verified",
      user,
      token: signToken(key),
    });
  } catch (err) {
    console.error("googleSignIn error:", err.message);
    return res.status(401).json({ success: false, message: "Invalid Google token" });
  }
};