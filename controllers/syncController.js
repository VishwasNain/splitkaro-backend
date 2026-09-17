const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');

// GET /api/sync - used on app startup to hydrate all local state from MongoDB in one call.
async function getSync(req, res) {
  try {
    const [user, groups, expenses, settlements] = await Promise.all([
      User.findById('you'),
      Group.find({}),
      Expense.find({}),
      Settlement.find({}),
    ]);
    res.json({
      user: user || { id: 'you', name: 'You', phone: '' },
      groups,
      expenses,
      settlements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/user - upserts the single user profile document.
async function putUser(req, res) {
  try {
    const { name, phone } = req.body || {};
    const user = await User.findByIdAndUpdate(
      'you',
      { name, phone },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Generic "replace the whole collection with what the client has" helper.
// This mirrors exactly how the app persists to AsyncStorage (the full array,
// every time), so there's no separate create/update/delete logic to keep in sync.
function makeReplaceCollectionHandler(Model, bodyKey) {
  return async (req, res) => {
    try {
      const items = req.body?.[bodyKey];
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: `Expected an array at body.${bodyKey}` });
      }
      const docs = items.map((item) => {
        const doc = { ...item, _id: item.id };
        delete doc.id;
        // Group documents store this as isNewGroup internally (see models/Group.js)
        // to avoid colliding with Mongoose's reserved `isNew` document property.
        if (Object.prototype.hasOwnProperty.call(doc, 'isNew')) {
          doc.isNewGroup = doc.isNew;
          delete doc.isNew;
        }
        return doc;
      });
      await Model.deleteMany({});
      if (docs.length > 0) await Model.insertMany(docs, { ordered: false });
      const saved = await Model.find({});
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: err.message });
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
