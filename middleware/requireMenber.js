const Group = require('../models/Group');

// Use on EVERY group route: expenses, summary, balance, pool, invites.
module.exports = async function requireMember(req, res, next) {
  const groupId = req.params.id || req.params.groupId;
  const group = await Group.findOne({ _id: groupId, members: req.user.id });
  if (!group) return res.status(403).json({ error: 'Not a member of this group' });
  req.group = group;
  next();
};
