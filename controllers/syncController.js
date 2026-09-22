const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const { acctId, toStoredId, mapKeys, groupToClient, expenseToClient } = require('../utils/identity');

const MAX_ITEMS = 5000;

// Fields the app didn't send stay untouched instead of being overwritten with null.
const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// Groups a person may see: ones they created + ones they joined through an invite.
const accessFilter = (userId) => ({
  deletedAt: null,
  $or: [{ ownerId: userId }, { memberAccounts: userId }],
});

// GET /api/sync - hydrates local state, scoped to req.userId (verified JWT).
// Includes groups shared with this user and every expense inside them.
async function getSync(req, res) {
  try {
    const { userId } = req;
    const [user, groups] = await Promise.all([
      User.findById(userId),
      Group.find(accessFilter(userId)),
    ]);
    const groupIds = groups.map((g) => g._id);

    // Real display names of everyone in these groups (owners + joined accounts).
    const emails = [...new Set(groups.flatMap((g) => [g.ownerId, ...(g.memberAccounts || [])]))];
    const people = await User.find({ _id: { $in: emails } }).select('name');
    const nameByAcct = {};
    emails.forEach((email) => {
      const p = people.find((u) => u._id === email);
      nameByAcct[acctId(email)] = p?.name && p.name !== 'You' ? p.name : email.split('@')[0];
    });

    const [expenses, settlements] = await Promise.all([
      Expense.find({ $or: [{ ownerId: userId }, { groupId: { $in: groupIds } }] }),
      Settlement.find({ ownerId: userId }),
    ]);

    res.json({
      user: user || { id: userId, name: 'You', phone: '' },
      groups: groups.map((g) => groupToClient(g, userId, nameByAcct)),
      expenses: expenses.map((e) => expenseToClient(e, userId)),
      settlements,
    });
  } catch (err) {
    console.error('sync error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/user - upserts the calling user's own profile document (_id = their email).
async function putUser(req, res) {
  try {
    const { userId } = req;
    const { name, phone } = req.body || {};
    const user = await User.findByIdAndUpdate(
      userId,
      { name, phone },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(user);
  } catch (err) {
    console.error('sync error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ---------- groups ----------

// Members the app sends. Ids are converted to stored form; anything that isn't a plain
// {id, name} is dropped, so the app can't forge account-backed members.
function cleanMembers(list, userId) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  list.forEach((m) => {
    if (!m || typeof m.id !== 'string' || !m.id) return;
    const id = toStoredId(m.id, userId);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, name: String(m.name || '').slice(0, 80) });
  });
  return out;
}

// Account-backed members (u_...) are controlled by the server; everything else follows the app.
// storedFirst=true (non-owners): existing entries always win, they can only ADD local friends.
function mergeMembers(stored, incoming, storedFirst, selfId) {
  const storedById = new Map((stored || []).map((m) => [m.id, { id: m.id, name: m.name }]));
  const isAccount = (id) => id.startsWith('u_') && id !== selfId; // the caller's own entry is theirs to send
  const result = new Map();

  if (storedFirst) {
    storedById.forEach((m, id) => result.set(id, m));
    incoming.forEach((m) => { if (!result.has(m.id) && !isAccount(m.id)) result.set(m.id, m); });
  } else {
    incoming.forEach((m) => { if (!isAccount(m.id) || storedById.has(m.id)) result.set(m.id, storedById.get(m.id) || m); });
    storedById.forEach((m, id) => { if (isAccount(id) && !result.has(id)) result.set(id, m); }); // keep joined friends
  }
  return Array.from(result.values());
}

async function putGroups(req, res) {
  try {
    const { userId } = req;
    const items = req.body?.groups;
    if (!Array.isArray(items) || items.length > MAX_ITEMS) {
      return res.status(400).json({ error: 'Expected an array at body.groups' });
    }
    const incoming = items.filter((g) => g && typeof g.id === 'string' && g.id);
    const ids = incoming.map((g) => g.id);

    const existing = await Group.find({ _id: { $in: ids } });
    const byId = new Map(existing.map((g) => [g._id, g]));
    const ops = [];

    incoming.forEach((item) => {
      const stored = byId.get(item.id);
      const members = cleanMembers(item.members, userId);
      const fields = {
        name: item.name, category: item.category, icon: item.icon, color: item.color,
        isNewGroup: item.isNew, createdAt: item.createdAt,
      };

      if (!stored) {
        ops.push({ insertOne: { document: { _id: item.id, ownerId: userId, memberAccounts: [], ...defined(fields), members } } });
      } else if (stored.deletedAt) {
        // deleted group: never resurrect it from a stale device
      } else if (stored.ownerId === userId) {
        ops.push({ updateOne: {
          filter: { _id: item.id, ownerId: userId },
          update: { $set: { ...defined(fields), members: mergeMembers(stored.members, members, false, acctId(userId)) } },
        } });
      } else if (stored.memberAccounts.includes(userId)) {
        ops.push({ updateOne: {
          filter: { _id: item.id },
          update: { $set: { members: mergeMembers(stored.members, members, true, acctId(userId)) } },
        } });
      } // else: someone else's group - ignore
    });

    if (ops.length) await Group.bulkWrite(ops, { ordered: false });

    // Groups the owner no longer has: soft-delete them and remove their expenses (any author).
    const gone = await Group.find({ ownerId: userId, deletedAt: null, _id: { $nin: ids } }).select('_id');
    if (gone.length) {
      const goneIds = gone.map((g) => g._id);
      await Group.updateMany({ _id: { $in: goneIds } }, { $set: { deletedAt: new Date() } });
      await Expense.deleteMany({ groupId: { $in: goneIds } });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('sync error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ---------- expenses ----------

function cleanShares(shares, userId) {
  if (!shares || typeof shares !== 'object' || Array.isArray(shares)) return {};
  const out = {};
  Object.keys(shares).forEach((k) => {
    const n = Number(shares[k]);
    if (Number.isFinite(n)) out[toStoredId(k, userId)] = n;
  });
  return out;
}

async function putExpenses(req, res) {
  try {
    const { userId } = req;
    const items = req.body?.expenses;
    if (!Array.isArray(items) || items.length > MAX_ITEMS) {
      return res.status(400).json({ error: 'Expected an array at body.expenses' });
    }
    const incoming = items.filter((e) => e && typeof e.id === 'string' && e.id);
    const ids = incoming.map((e) => e.id);

    const groupIds = [...new Set(incoming.map((e) => e.groupId).filter(Boolean))];
    const [existing, groups] = await Promise.all([
      Expense.find({ _id: { $in: ids } }).select('ownerId groupId'),
      Group.find({ _id: { $in: groupIds } }).select('ownerId memberAccounts deletedAt'),
    ]);
    const expById = new Map(existing.map((e) => [e._id, e]));
    const groupById = new Map(groups.map((g) => [g._id, g]));
    const canUseGroup = (gid) => {
      const g = groupById.get(gid);
      if (!g) return true; // not on the server yet (its own PUT /groups may still be in flight)
      return !g.deletedAt && (g.ownerId === userId || g.memberAccounts.includes(userId));
    };

    const ops = [];
    incoming.forEach((item) => {
      const stored = expById.get(item.id);
      const fields = {
        description: item.description, category: item.category, amount: Number(item.amount) || 0,
        paidBy: toStoredId(item.paidBy, userId), splitType: item.splitType,
        shares: cleanShares(item.shares, userId), date: item.date,
        comments: Array.isArray(item.comments) ? item.comments : [],
        isSettlement: !!item.isSettlement, createdAt: item.createdAt,
      };

      if (!stored) {
        if (item.groupId && !canUseGroup(item.groupId)) return; // not your group
        ops.push({ updateOne: {
          filter: { _id: item.id },
          update: { $set: defined({ ...fields, groupId: item.groupId }), $setOnInsert: { ownerId: userId } },
          upsert: true,
        } });
      } else if (stored.ownerId === userId || (stored.groupId && canUseGroup(stored.groupId))) {
        // author, or a member of the group it belongs to. groupId is never changed here.
        ops.push({ updateOne: { filter: { _id: item.id }, update: { $set: defined(fields) } } });
      } // else: not yours - ignore
    });

    if (ops.length) await Expense.bulkWrite(ops, { ordered: false });

    // Expenses YOU wrote that the app no longer has. Other people's expenses are never
    // removed by absence (your copy may simply be stale) - use DELETE /api/expenses/:id.
    await Expense.deleteMany({ ownerId: userId, _id: { $nin: ids } });

    res.json({ ok: true });
  } catch (err) {
    console.error('sync error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /api/expenses/:id - the author, or the owner of the group it belongs to.
async function deleteExpense(req, res) {
  try {
    const { userId } = req;
    const exp = await Expense.findById(req.params.id).select('ownerId groupId');
    if (!exp) return res.json({ ok: true });
    let allowed = exp.ownerId === userId;
    if (!allowed && exp.groupId) {
      allowed = !!(await Group.exists({ _id: exp.groupId, ownerId: userId }));
    }
    if (!allowed) return res.status(403).json({ error: 'Only the person who added it or the group owner can delete this' });
    await Expense.deleteOne({ _id: exp._id });
    res.json({ ok: true });
  } catch (err) {
    console.error('sync error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ---------- settlements (unchanged: still per-user, the app stores settlements as expenses) ----------

async function putSettlements(req, res) {
  try {
    const { userId } = req;
    const items = req.body?.settlements;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected an array at body.settlements' });
    const docs = items.map((item) => {
      const doc = { ...item, _id: item.id, ownerId: userId };
      delete doc.id;
      return doc;
    });
    await Settlement.deleteMany({ ownerId: userId });
    if (docs.length > 0) await Settlement.insertMany(docs, { ordered: false });
    res.json(await Settlement.find({ ownerId: userId }));
  } catch (err) {
    console.error('sync error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { mergeMembers, cleanMembers, getSync, putUser, putGroups, putExpenses, putSettlements, deleteExpense };
