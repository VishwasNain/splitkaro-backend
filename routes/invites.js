const router = require('express').Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const Invite = require('../models/Invite');
const Group = require('../models/Group');
const auth = require('../middleware/auth');
const requireMember = require('../middleware/requireMember');
const sendMail = require('../utils/sendMail');

const BASE_URL = process.env.INVITE_BASE_URL || 'https://splitkaro.app';
const LOCK_EMAIL_INVITES = process.env.LOCK_EMAIL_INVITES !== 'false'; // default: locked
const QR_TTL = 10 * 60 * 1000;
const EMAIL_TTL = 7 * 24 * 3600 * 1000;

const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  keyGenerator: req => req.user.id, standardHeaders: true,
});

// A) QR: fresh single-use token on every call
router.post('/groups/:id/invites/qr', auth, requireMember, async (req, res) => {
  const token = newToken();
  await Invite.create({
    tokenHash: hash(token), group: req.group._id, invitedBy: req.user.id,
    type: 'qr', expiresAt: new Date(Date.now() + QR_TTL),
  });
  res.json({ link: `${BASE_URL}/join/${token}`, expiresInSec: QR_TTL / 1000 });
});

// B) Email: used by Share button AND "+" on Add Expense
router.post('/groups/:id/invites/email', auth, requireMember, inviteLimiter, async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Invalid email' });

  const token = newToken();
  await Invite.create({
    tokenHash: hash(token), group: req.group._id, invitedBy: req.user.id,
    type: 'email', email, expiresAt: new Date(Date.now() + EMAIL_TTL),
  });

  await sendMail({
    to: email,
    subject: `${req.user.name} invited you to "${req.group.name}" on Splitkaro`,
    html: `<p>${req.user.name} invited you to join <b>${req.group.name}</b>.</p>
           <p><a href="${BASE_URL}/join/${token}">Join group</a></p>
           <p>This link expires in 7 days.</p>`,
  });
  res.json({ ok: true });
});

// C) Accept (friend must be logged in)
router.post('/invites/accept', auth, async (req, res) => {
  const tokenHash = hash(String(req.body.token || ''));
  const peek = await Invite.findOne({ tokenHash });
  if (peek && LOCK_EMAIL_INVITES && peek.type === 'email' &&
      peek.email !== req.user.email.toLowerCase())
    return res.status(403).json({ error: 'This invite was sent to a different email' });

  // atomic claim: cannot be used twice
  const inv = await Invite.findOneAndUpdate(
    { tokenHash, status: 'active', expiresAt: { $gt: new Date() },
      $expr: { $lt: ['$usedCount', '$maxUses'] } },
    { $inc: { usedCount: 1 } }, { new: true }
  );
  if (!inv) return res.status(410).json({ error: 'Invite invalid or expired' });
  if (inv.usedCount >= inv.maxUses) { inv.status = 'used'; await inv.save(); }

  await Group.updateOne({ _id: inv.group }, { $addToSet: { members: req.user.id } });
  res.json({ groupId: inv.group });
});

// D) Pending invites + revoke (members only)
router.get('/groups/:id/invites', auth, requireMember, async (req, res) => {
  const list = await Invite.find({ group: req.group._id, status: 'active', expiresAt: { $gt: new Date() } })
    .select('type email expiresAt createdAt').lean();
  res.json(list);
});

router.delete('/groups/:id/invites/:inviteId', auth, requireMember, async (req, res) => {
  await Invite.updateOne({ _id: req.params.inviteId, group: req.group._id }, { status: 'revoked' });
  res.json({ ok: true });
});

module.exports = router;
