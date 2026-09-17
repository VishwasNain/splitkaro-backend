// controllers/googleAuthController.js
// Verifies the Google ID token sent from the app after @react-native-google-signin/google-signin
// completes on-device sign-in. No Firebase involved — uses Google's own token-info endpoint.
//
// npm install google-auth-library

const { OAuth2Client } = require("google-auth-library");

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

    // TODO: look up or create the user in your DB by payload.email (or payload.sub),
    // then issue your app's session/JWT the same way the email-OTP flow does,
    // so both paths converge on the same "logged in" state.

    return res.status(200).json({
      success: true,
      message: "Google sign-in verified",
      user: {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        googleId: payload.sub,
      },
    });
  } catch (err) {
    console.error("googleSignIn error:", err.message);
    return res.status(401).json({ success: false, message: "Invalid Google token" });
  }
};