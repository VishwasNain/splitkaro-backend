const router = require('express').Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const Invite = require('../models/Invite');
const Group = require('../models/Group');
const User = require('../models/User');
const requireUser = require('../middleware/requireUser');
const requireMember = require('../middleware/requireMember');
const sendMail = require('../utils/sendMail');
const { acctId } = require('../utils/identity');

// Public URL that friends tap / scan. It is the backend's own /join page (see routes/join.js),
// which opens the app - so no domain or Android App Links setup is needed.
const BASE_URL = (process.env.INVITE_BASE_URL || 'https://splitkaro-backend-9nar.onrender.com').replace(/\/$/, '');
// true (default): an email invite only works for the account with that email.
const LOCK_EMAIL_INVITES = process.env.LOCK_EMAIL_INVITES !== 'false';
const QR_TTL_MS = 10 * 60 * 1000;
const EMAIL_TTL_MS = 7 * 24 * 3600 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('invite error:', err.message);
    res.status(500).json({ error: 'Server error' });
  });

const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10, // email invites per user per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: 'Too many invites. Try again in a while.' },
});

const qrLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: 'Too many QR codes. Try again in a while.' },
});

async function displayName(userId) {
  const u = await User.findById(userId);
  return u?.name && u.name !== 'You' ? u.name : userId.split('@')[0];
}

// A) QR: a brand-new single-use token on EVERY call, valid 10 minutes.
router.post('/groups/:id/invites/qr', requireUser, requireMember, qrLimiter, wrap(async (req, res) => {
  const token = newToken();
  await Invite.create({
    tokenHash: hash(token),
    group: req.group._id,
    invitedBy: req.userId,
    type: 'qr',
    expiresAt: new Date(Date.now() + QR_TTL_MS),
  });
  res.json({ link: `${BASE_URL}/join/${token}`, expiresInSec: QR_TTL_MS / 1000 });
}));

// B) Email: used by the Share button AND the "+" on Add Expense. Sends immediately.
router.post('/groups/:id/invites/email', requireUser, requireMember, inviteLimiter, wrap(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (email === req.userId) return res.status(400).json({ error: "That's your own email" });

  const token = newToken();
  const inviter = await displayName(req.userId);
  const link = `${BASE_URL}/join/${token}`;

  await Invite.create({
    tokenHash: hash(token),
    group: req.group._id,
    invitedBy: req.userId,
    type: 'email',
    email,
    expiresAt: new Date(Date.now() + EMAIL_TTL_MS),
  });

  try {
    await sendMail({
      to: email,
      subject: `${inviter} invited you to "${req.group.name}" on Splitkaro`,
      html: `
        <div style="font-family:sans-serif;padding:24px;max-width:480px">
          <h2>You're invited</h2>
          <p><b>${esc(inviter)}</b> invited you to join <b>${esc(req.group.name)}</b> on Splitkaro.</p>
          <p><a href="${link}" style="display:inline-block;background:#5665D8;color:#fff;padding:12px 24px;border-radius:24px;text-decoration:none;font-weight:bold">Join group</a></p>
          <p style="color:#888;font-size:13px">Open this on the phone that has Splitkaro installed and sign in with <b>${esc(email)}</b>. The link expires in 7 days and only works once.</p>
        </div>`,
    });
  } catch (err) {
    await Invite.deleteOne({ tokenHash: hash(token) }); // don't leave a live link nobody received
    console.error('invite mail failed:', err.message);
    return res.status(502).json({ error: 'Could not send the email. Try again.' });
  }
  res.json({ ok: true });
}));

// C) Accept: the friend (logged in) opens the link. Adds them to THIS group only.
router.post('/invites/accept', requireUser, wrap(async (req, res) => {
  const token = String(req.body?.token || '');
  if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'Invalid invite link' });
  const tokenHash = hash(token);

  const invite = await Invite.findOne({ tokenHash });
  if (!invite || invite.status === 'revoked' || invite.expiresAt <= new Date()) {
    return res.status(410).json({ error: 'This invite is invalid or has expired' });
  }

  const group = await Group.findOne({ _id: invite.group, deletedAt: null });
  if (!group) return res.status(410).json({ error: 'This group no longer exists' });

  // Already in? Succeed without using up the invite.
  if (group.ownerId === req.userId || group.memberAccounts.includes(req.userId)) {
    return res.json({ groupId: group._id, groupName: group.name, alreadyMember: true });
  }

  if (LOCK_EMAIL_INVITES && invite.type === 'email' && invite.email !== req.userId) {
    return res.status(403).json({ error: `This invite was sent to another email. Log in as ${invite.email}.` });
  }

  // Atomic claim: two people (or two taps) can't both use a single-use invite.
  const claimed = await Invite.findOneAndUpdate(
    { tokenHash, status: 'active', expiresAt: { $gt: new Date() }, $expr: { $lt: ['$usedCount', '$maxUses'] } },
    { $inc: { usedCount: 1 } },
    { new: true }
  );
  if (!claimed) return res.status(410).json({ error: 'This invite was already used' });
  if (claimed.usedCount >= claimed.maxUses) {
    await Invite.updateOne({ _id: claimed._id }, { $set: { status: 'used' } });
  }

  const myId = acctId(req.userId);
  const name = await displayName(req.userId);
  await Group.updateOne({ _id: group._id }, { $addToSet: { memberAccounts: req.userId } });
  await Group.updateOne(
    { _id: group._id, 'members.id': { $ne: myId } },
    { $push: { members: { id: myId, name } } }
  );

  res.json({ groupId: group._id, groupName: group.name });
}));

// D) Pending invites + revoke (any member of the group)
router.get('/groups/:id/invites', requireUser, requireMember, wrap(async (req, res) => {
  const list = await Invite.find({ group: req.group._id, status: 'active', expiresAt: { $gt: new Date() } })
    .select('type email expiresAt createdAt')
    .lean();
  res.json(list);
}));

router.delete('/groups/:id/invites/:inviteId', requireUser, requireMember, wrap(async (req, res) => {
  await Invite.updateOne({ _id: req.params.inviteId, group: req.group._id }, { $set: { status: 'revoked' } });
  res.json({ ok: true });
}));

module.exports = router;
