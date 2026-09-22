require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const syncRoutes = require('./routes/sync');
const authRoutes = require('./routes/auth');
const inviteRoutes = require('./routes/invites');
const joinRoutes = require('./routes/join');
// The old phone-OTP route (/api/otp) was removed: it returned the code in the response.

const app = express();

// Render sits behind a proxy; needed so rate limits see the real client IP.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: false })); // the native app doesn't need CORS
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'splitkaro-backend' });
});

// Brute-force / abuse protection for login, OTP and password endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

app.use('/api', syncRoutes);
app.use('/api', inviteRoutes);
app.use(joinRoutes); // public /join/:token page that opens the app
app.use('/api/auth', authLimiter, authRoutes);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Splitkaro backend running on port ${PORT}`);
  });
});
