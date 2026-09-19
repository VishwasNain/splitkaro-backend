// routes/auth.js
const express = require("express");
const router = express.Router();

const { sendEmailOtp, verifyEmailOtp } = require("../controllers/emailOtpController");
const { googleSignIn } = require("../controllers/googleAuthController");
const { login, setPassword } = require("../controllers/passwordController");

router.post("/otp/send-email", sendEmailOtp);
router.post("/otp/verify-email", verifyEmailOtp);
router.post("/google", googleSignIn);
router.post("/login", login);
router.post("/set-password", setPassword);

module.exports = router;