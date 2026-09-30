const express = require('express');
const multer = require('multer');
const router = express.Router();
const requireUser = require('../middleware/requireUser');
const Bill = require('../models/Bill');
const Group = require('../models/Group');
const { signFileToken, verifyFileToken } = require('../utils/token');
const { ALLOWED, sniffMime, saveFile, openFile, deleteFile } = require('../utils/billFiles');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

// Groups this user owns or joined.
async function myGroupIds(userId) {
  const groups = await Group.find({
    deletedAt: null,
    $or: [{ ownerId: userId }, { memberAccounts: userId }],
  }).select('_id');
  return groups.map((g) => g._id);
}

// Personal bill -> only its owner. Group bill -> any member of that group.
async function canSee(bill, userId) {
  if (bill.ownerId === userId) return true;
  if (!bill.groupId) return false;
  return (await myGroupIds(userId)).includes(bill.groupId);
}

// GET /api/bills - my personal bills + every bill in my groups.
router.get('/bills', requireUser, async (req, res) => {
  try {
    const ids = await myGroupIds(req.userId);
    const bills = await Bill.find({
      $or: [{ ownerId: req.userId }, { groupId: { $in: ids } }],
    }).sort({ createdAt: -1 });
    res.json({ bills });
  } catch (e) {
    console.error('bills list:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/bills - multipart: fields + optional "file".
router.post('/bills', requireUser, (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'File is too large (max 10 MB)' : 'Upload failed' });
    }
    next();
  }),
  async (req, res) => {
    try {
      const b = req.body || {};
      const name = String(b.name || '').trim().slice(0, 120);
      const amount = Number(b.amount);
      if (!b.id || !name) return res.status(400).json({ error: 'id and name are required' });
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'Invalid amount' });

      const groupId = b.groupId && b.groupId !== 'null' ? String(b.groupId) : null;
      if (groupId && !(await myGroupIds(req.userId)).includes(groupId)) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }

      // Idempotent: a retry after a timeout returns the bill instead of duplicating it.
      const existing = await Bill.findById(b.id);
      if (existing) return res.json({ bill: existing });

      let attachment;
      if (req.file) {
        const mime = sniffMime(req.file.buffer);
        if (!mime || !ALLOWED[mime]) return res.status(415).json({ error: 'Only JPG, PNG, WebP or PDF files are allowed' });
        const fileName = String(req.file.originalname || 'bill').replace(/[^\w.\- ]/g, '_').slice(0, 100);
        const fileId = await saveFile(req.file.buffer, fileName, mime);
        attachment = {
          fileId,
          type: ALLOWED[mime],
          mimeType: mime,
          fileName,
          size: req.file.size,
          source: ['camera', 'gallery', 'file'].includes(b.source) ? b.source : undefined,
        };
      }

      const bill = await Bill.create({
        _id: String(b.id),
        ownerId: req.userId,
        groupId,
        name,
        amount,
        category: b.category || 'Other',
        dueDate: b.dueDate || undefined,
        createdAt: b.createdAt || new Date().toISOString(),
        attachment,
      });
      res.status(201).json({ bill });
    } catch (e) {
      console.error('bill create:', e.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// PATCH /api/bills/:id/paid
router.patch('/bills/:id/paid', requireUser, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill || !(await canSee(bill, req.userId))) return res.status(404).json({ error: 'Bill not found' });
    bill.isPaid = true;
    bill.paidAt = new Date().toISOString();
    await bill.save();
    res.json({ bill });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/bills/:id - uploader, or the group owner for a group bill.
router.delete('/bills/:id', requireUser, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.json({ ok: true });
    let allowed = bill.ownerId === req.userId;
    if (!allowed && bill.groupId) {
      const g = await Group.findOne({ _id: bill.groupId, ownerId: req.userId, deletedAt: null });
      allowed = !!g;
    }
    if (!allowed) return res.status(403).json({ error: 'Only the uploader or group owner can delete this bill' });
    if (bill.attachment?.fileId) await deleteFile(bill.attachment.fileId);
    await bill.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bills/:id/link - a 10-minute URL for the file.
router.get('/bills/:id/link', requireUser, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill?.attachment?.fileId || !(await canSee(bill, req.userId))) {
      return res.status(404).json({ error: 'File not found' });
    }
    const t = signFileToken(bill._id, req.userId);
    res.json({ url: `${req.protocol}://${req.get('host')}/api/bills/${encodeURIComponent(bill._id)}/file?t=${t}` });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bills/:id/file?t=... - streams the file (token proves access).
router.get('/bills/:id/file', async (req, res) => {
  try {
    try { verifyFileToken(String(req.query.t || ''), req.params.id); }
    catch { return res.status(401).json({ error: 'Link expired' }); }
    const bill = await Bill.findById(req.params.id);
    if (!bill?.attachment?.fileId) return res.status(404).json({ error: 'File not found' });
    res.set({
      'Content-Type': bill.attachment.mimeType,
      'Content-Disposition': `inline; filename="${bill.attachment.fileName}"`,
      'Cache-Control': 'private, max-age=300',
    });
    openFile(bill.attachment.fileId).on('error', () => res.status(404).end()).pipe(res);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
