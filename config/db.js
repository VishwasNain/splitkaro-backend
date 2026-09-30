const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is required');
  }
  try {
    await mongoose.connect(uri);
    // Log the host only - the full URI contains the database password.
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    console.error('Is MongoDB running locally? Start it before starting this server.');
    process.exit(1);
  }
}

module.exports = connectDB;
