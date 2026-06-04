'use strict';

const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation error', details: err.message });
  }
  const status = err.status || 500;
  if (status >= 500) logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  return res.status(status).json({ error: err.message || 'internal server error' });
};
