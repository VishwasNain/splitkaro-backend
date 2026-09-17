# Splitkaro Backend

A small Node.js + Express + MongoDB server that gives the Splitkaro app real database
persistence. The React Native app still works fully offline with AsyncStorage even
without this server running — when this server *is* reachable, the app prefers it as
the source of truth and keeps AsyncStorage as a local cache.

## 1. Install MongoDB Community Server (if you don't have it)

1. Download from https://www.mongodb.com/try/download/community (choose Windows, MSI).
2. Run the installer, choosing **"Install as a Service"** (default) — this means MongoDB
   starts automatically in the background and you don't need to launch it manually.
3. It installs to `mongodb://127.0.0.1:27017` by default — that's what this backend
   is already configured to use.

## 2. Install MongoDB Compass (the GUI)

1. Download from https://www.mongodb.com/try/download/compass (Windows).
2. Install and open it.
3. Connect using this connection string: `mongodb://127.0.0.1:27017`
4. Once this backend has run at least once, you'll see a `splitkaro` database with
   4 collections: `users`, `groups`, `expenses`, `settlements`. Click into any of them
   to see your app's real data update live as you use the app.

## 3. Set up and run this backend

Open a terminal in this `backend` folder:

```
npm install
copy .env.example .env
npm start
```

You should see:
```
MongoDB connected: mongodb://127.0.0.1:27017/splitkaro
Splitkaro backend running on http://localhost:5000
Android emulator should reach it at http://10.0.2.2:5000
```

Leave this running in its own terminal while you use the app (`npx react-native run-android`
in a separate terminal, same as before).

## 4. Networking notes (important)

- **Android emulator**: use `http://10.0.2.2:5000` to reach your PC's `localhost:5000`.
  `10.0.2.2` is a special address the emulator maps to your host machine — this is
  already set as the default in the app's `src/services/api.js`.
- **Physical Android device**: `10.0.2.2` will NOT work. Find your PC's LAN IP
  (`ipconfig` in PowerShell, look for IPv4 Address) and change the `BASE_URL` in
  `src/services/api.js` to `http://<your-pc-lan-ip>:5000`. Your phone and PC must be
  on the same Wi-Fi network, and Windows Firewall must allow inbound connections on
  port 5000 (you may get a firewall prompt the first time — allow it).

## 5. What's stored where

| Collection | Mirrors local key | Mongoose model |
|---|---|---|
| `users` | `@splitkaro_user` | `models/User.js` |
| `groups` | `@splitkaro_groups` | `models/Group.js` |
| `expenses` | `@splitkaro_expenses` | `models/Expense.js` |
| `settlements` | `@splitkaro_settlements` | `models/Settlement.js` |

Every collection uses the app's own client-generated IDs (e.g. `grp_1699...`) as
MongoDB's `_id`, so there's no ID-remapping between the app and the database.

## 6. API endpoints

- `GET /api/sync` — returns `{ user, groups, expenses, settlements }` in one call.
  Used on app startup to hydrate local state from the database.
- `PUT /api/user` — upserts the single user profile document.
- `PUT /api/groups` — body `{ groups: [...] }`, replaces the entire groups collection.
- `PUT /api/expenses` — body `{ expenses: [...] }`, replaces the entire expenses collection.
- `PUT /api/settlements` — body `{ settlements: [...] }`, replaces the entire settlements collection.

The "replace the whole collection" design mirrors exactly how the app already persists
to AsyncStorage (the full array, every time) — so there's no separate create/update/delete
logic to keep in sync between client and server, and deleting something locally (like
deleting a group) is automatically reflected in MongoDB on the next sync.

## 7. Known limitations (by design, to keep this a reasonable scope)

- **No authentication.** This is a single-user, local-network setup — anyone who can
  reach the server's port can read/write the data. Fine for personal/local use;
  not something to expose to the public internet as-is.
- **No conflict resolution.** If you somehow ran the app on two devices against the
  same backend at once, the last write wins per collection. Not an issue for one
  person using one phone.
