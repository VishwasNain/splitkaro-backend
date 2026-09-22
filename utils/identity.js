// utils/identity.js
//
// WHY THIS EXISTS
// Every client calls itself 'you' (expense.paidBy === 'you', shares.you, member id 'you').
// Once a group is shared, 'you' would mean a DIFFERENT person on each phone. So the server
// stores an opaque, stable id per account (u_<hmac>) and swaps it with 'you' per request:
//
//   stored -> client:  own account id becomes 'you', everyone else keeps their u_... id
//   client -> stored:  'you' becomes the caller's account id
//
// Old documents saved before this change still contain 'you'. That always meant the
// document's author (ownerId), so reads treat it that way - no migration needed.
// The id is an HMAC of the email, so other group members never see anyone's email.

const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is missing');

const acctId = (email) =>
  'u_' + crypto.createHmac('sha256', SECRET).update(String(email).toLowerCase().trim()).digest('hex').slice(0, 16);

// stored id -> id as seen by `requesterId`. `authorId` = who 'you' meant when it was saved.
function toClientId(id, authorId, requesterId) {
  const canon = id === 'you' ? acctId(authorId) : id;
  return canon === acctId(requesterId) ? 'you' : canon;
}

// client id -> id to store
function toStoredId(id, requesterId) {
  return id === 'you' ? acctId(requesterId) : id;
}

function mapKeys(obj, fn) {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    const nk = fn(k);
    out[nk] = (out[nk] || 0) + Number(obj[k] || 0);
  });
  return out;
}

// ---- documents -> what the app receives ----
// nameByAcct: { u_xxx: 'Real Name' } - so a member the app stored as the placeholder "You"
// (the owner) shows up under their real name for everyone else.
function groupToClient(doc, requesterId, nameByAcct = {}) {
  const g = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  const ownerId = doc.ownerId;
  const out = {
    ...g,
    isOwner: ownerId === requesterId,
    members: (g.members || []).map((m) => {
      const id = toClientId(m.id, ownerId, requesterId);
      return { id, name: nameByAcct[id] || m.name };
    }),
  };
  delete out.ownerId;          // never expose account emails to other members
  delete out.memberAccounts;
  delete out.deletedAt;
  return out;
}

function expenseToClient(doc, requesterId) {
  const e = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  const authorId = doc.ownerId;
  const out = {
    ...e,
    paidBy: toClientId(e.paidBy, authorId, requesterId),
    shares: mapKeys(e.shares, (k) => toClientId(k, authorId, requesterId)),
  };
  delete out.ownerId;
  return out;
}

module.exports = { acctId, toClientId, toStoredId, mapKeys, groupToClient, expenseToClient };
