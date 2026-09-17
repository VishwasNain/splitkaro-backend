// routes/auth.js
const express = require("express");
const router = express.Router();

const { sendEmailOtp, verifyEmailOtp } = require("../controllers/emailOtpController");
const { googleSignIn } = require("../controllers/googleAuthController");

router.post("/otp/send-email", sendEmailOtp);
router.post("/otp/verify-email", verifyEmailOtp);
router.post("/google", googleSignIn);

module.exports = router;