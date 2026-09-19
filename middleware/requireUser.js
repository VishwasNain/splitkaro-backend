// middleware/requireUser.js
//
// Sync routes need to know WHICH account is making the request. Since there's
// no JWT/session system, the app sends the logged-in user's email as a simple
// header on every sync call: x-user-id.
//
// Guests (Skip button, never logged in) send no header at all - these routes
// then correctly return 401, and the app's existing "server unreachable ->
// fall back to AsyncStorage-only" logic (in api.js/AppContext.js) kicks in
// automatically. That's the desired behavior: guests never sync to the cloud,
// they're local-only until they actually log in.

function requireUser(req, res, next) {
  const userId = req.header('x-user-id');

  if (!userId) {
    return res.status(401).json({ error: 'Missing x-user-id header - login required to sync' });
  }

  req.userId = userId.toLowerCase().trim();
  next();
}

module.exports = requireUser;