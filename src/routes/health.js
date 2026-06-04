'use strict';

const express = require('express');
const { mongoose } = require('../db/mongo');

const router = express.Router();

router.get('/', (req, res) => {
  const mongoUp = mongoose.connection.readyState === 1;
  res.status(mongoUp ? 200 : 503).json({
    status: mongoUp ? 'ok' : 'degraded',
    services: { mongodb: mongoUp ? 'up' : 'down' },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
