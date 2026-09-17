require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const syncRoutes = require('./routes/sync');
const otpRoutes = require('./routes/otp');
const authRoutes = require("./routes/auth");
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'splitkaro-backend' });
});

app.use('/api', syncRoutes);
app.use('/api/otp', otpRoutes);
app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Splitkaro backend running on http://localhost:${PORT}`);
    console.log(`Android emulator should reach it at http://10.0.2.2:${PORT}`);
  });
});