const Message = require('../models/Message');
const User = require('../models/User');
const { acctId } = require('../utils/identity');

const MAX_MESSAGES = 200;

// GET /api/groups/:id/messages?after=<ISO timestamp>
// requireMember (run before this) has already confirmed req.userId can see this group.
async function listMessages(req, res) {
  try {
    const { userId } = req;
    const filter = { groupId: req.params.id };

    if (req.query.after) {
      const parsed = new Date(req.query.after);
      if (!Number.isNaN(parsed.getTime())) filter.createdAt = { $gt: parsed };
    }

    const messages = await Message.find(filter).sort({ createdAt: 1 }).limit(MAX_MESSAGES);

    // Resolve real display names for everyone except the caller.
    const senderEmails = [...new Set(messages.map((m) => m.senderId).filter((id) => id !== userId))];
    const people = senderEmails.length ? await User.find({ _id: { $in: senderEmails } }).select('name') : [];
    const nameByEmail = {};
    people.forEach((p) => {
      nameByEmail[p._id] = p.name;
    });

    const out = messages.map((m) => {
      const isSelf = m.senderId === userId;
      return {
        id: m._id,
        groupId: m.groupId,
        text: m.text,
        senderId: isSelf ? 'you' : acctId(m.senderId),
        senderName: isSelf ? 'You' : nameByEmail[m.senderId] || m.senderId.split('@')[0],
        createdAt: m.createdAt.toISOString(),
      };
    });

    res.json({ messages: out });
  } catch (err) {
    console.error('messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/groups/:id/messages  { text }
async function sendMessage(req, res) {
  try {
    const { userId } = req;
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ error: 'Message text is required' });

    const doc = await Message.create({ groupId: req.params.id, senderId: userId, text });

    res.json({
      id: doc._id,
      groupId: doc.groupId,
      text: doc.text,
      senderId: 'you',
      senderName: 'You',
      createdAt: doc.createdAt.toISOString(),
    });
  } catch (err) {
    console.error('messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listMessages, sendMessage };
