'use strict';

const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../utils/logger');

// Connect with simple retry/backoff so the service survives a slow database.
async function connectMongo(retries = 10, delayMs = 3000) {
  mongoose.set('strictQuery', true);
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000 });
      logger.info('Connected to MongoDB');
      return mongoose.connection;
    } catch (err) {
      logger.warn({ attempt, error: err.message }, 'MongoDB connection failed, retrying');
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

module.exports = { connectMongo, mongoose };
