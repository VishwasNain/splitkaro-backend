// Public landing page for invite links (email + QR). It is what a phone camera or a mail app
// opens, and it hands the token to the installed app via the splitkaro:// link.
// Nothing here touches the database: the token is only validated when the app calls
// POST /api/invites/accept while logged in.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');

const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;
const PACKAGE = process.env.ANDROID_PACKAGE;       // e.g. com.splitkaro  (optional)
const PLAY_URL = process.env.PLAY_STORE_URL || ''; // optional fallback if app isn't installed

const limiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

router.get('/join/:token', limiter, (req, res) => {
  const { token } = req.params;
  if (!TOKEN_RE.test(token)) return res.status(404).send('Invalid invite link');

  const scheme = `splitkaro://join/${token}`;
  // With the package name set, Android Chrome falls back to the Play Store if the app is missing.
  const href = PACKAGE
    ? `intent://join/${token}#Intent;scheme=splitkaro;package=${PACKAGE};${PLAY_URL ? `S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};` : ''}end`
    : scheme;

  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Join on Splitkaro</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 24px;color:#1a1a1e">
  <h2>You're invited to a Splitkaro group</h2>
  <p style="color:#8a8a93">Tap the button on the phone that has Splitkaro installed.</p>
  <p><a href="${href}" style="display:inline-block;background:#5665D8;color:#fff;padding:14px 32px;border-radius:28px;text-decoration:none;font-weight:bold">Open in Splitkaro</a></p>
  ${PLAY_URL ? `<p><a href="${PLAY_URL}" style="color:#5665D8">Get the app</a></p>` : ''}
</body></html>`);
});

module.exports = router;
