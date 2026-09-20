const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');

// GET /api/sync - hydrates local state from MongoDB, scoped to req.userId
// (set by the requireUser middleware from the x-user-id header).
async function getSync(req, res) {
  try {
    const { userId } = req;
    const [user, groups, expenses, settlements] = await Promise.all([
      User.findById(userId),
      Group.find({ ownerId: userId }),
      Expense.find({ ownerId: userId }),
      Settlement.find({ ownerId: userId }),
    ]);
    res.json({
      user: user || { id: userId, name: 'You', phone: '' },
      groups,
      expenses,
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

// Generic "replace this user's whole collection with what the client has" helper.
// Scoped by ownerId so wiping-and-reinserting only ever touches the calling
// user's own documents, never anyone else's.
function makeReplaceCollectionHandler(Model, bodyKey) {
  return async (req, res) => {
    try {
      const { userId } = req;
      const items = req.body?.[bodyKey];
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: `Expected an array at body.${bodyKey}` });
      }
      const docs = items.map((item) => {
        const doc = { ...item, _id: item.id, ownerId: userId };
        delete doc.id;
        // Group documents store this as isNewGroup internally (see models/Group.js)
        // to avoid colliding with Mongoose's reserved `isNew` document property.
        if (Object.prototype.hasOwnProperty.call(doc, 'isNew')) {
          doc.isNewGroup = doc.isNew;
          delete doc.isNew;
        }
        return doc;
      });
      await Model.deleteMany({ ownerId: userId });
      if (docs.length > 0) await Model.insertMany(docs, { ordered: false });
      const saved = await Model.find({ ownerId: userId });
      res.json(saved);
    } catch (err) {
      console.error('sync error:', err.message);
    res.status(500).json({ error: 'Server error' });
    }
  };
}

module.exports = {
  getSync,
  putUser,
  putGroups: makeReplaceCollectionHandler(Group, 'groups'),
  putExpenses: makeReplaceCollectionHandler(Expense, 'expenses'),
  putSettlements: makeReplaceCollectionHandler(Settlement, 'settlements'),
};