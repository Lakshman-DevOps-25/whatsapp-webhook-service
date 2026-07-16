'use strict';

const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

// Validates Meta's X-Hub-Signature-256 header: HMAC-SHA256 of the raw request
// body keyed by the app secret. Requires the raw body (captured in app.js).
module.exports = function verifySignature(req, res, next) {
  const appSecret = config.whatsapp.appSecret;

  // If no app secret is configured (local/dev), skip but warn loudly.
  if (!appSecret) {
    logger.warn('WHATSAPP_APP_SECRET not set — skipping webhook signature verification');
    return next();
  }

  const signature = req.get('x-hub-signature-256') || '';
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody || Buffer.from('')).digest('hex');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    logger.warn('Invalid webhook signature — rejecting request');
    console.log('req-', req, ' ==== signature-256-', req.get('x-hub-signature-256') );
    return res.status(401).json({ error: 'invalid signature'});
  }
  return next();
};
