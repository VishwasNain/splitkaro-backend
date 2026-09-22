const Group = require('../models/Group');

// Run AFTER requireUser. Lets the request through only if the caller owns the group or
// joined it through an invite. Sets req.group.
module.exports = async function requireMember(req, res, next) {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      deletedAt: null,
      $or: [{ ownerId: req.userId }, { memberAccounts: req.userId }],
    });
    // Same answer for "doesn't exist" and "not yours" so ids can't be probed.
    if (!group) return res.status(403).json({ error: 'You are not a member of this group' });
    req.group = group;
    next();
  } catch (err) {
    console.error('requireMember error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};
