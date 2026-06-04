'use strict';

const pino = require('pino');
const config = require('../config');

// Logs to stdout as structured JSON. On Render.com, stdout/stderr are captured
// automatically and visible under the service's "Logs" tab.
const logger = pino({
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // Never log secrets, even if they appear on a logged object.
    paths: ['accessToken', '*.accessToken', 'appSecret', '*.appSecret', 'secretKey', '*.secretKey', 'token', '*.token'],
    censor: '[redacted]',
  },
});

module.exports = logger;
