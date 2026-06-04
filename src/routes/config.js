'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/errors');
const configService = require('../services/ConfigService');
const tokenManager = require('../services/TokenManager');

const router = express.Router();

// Mask sensitive values before returning config.
function present(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return { ...o, accessToken: o.accessToken ? `***${String(o.accessToken).slice(-4)}` : null };
}

// GET current config (token masked).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(present(await configService.getActive()));
  })
);

// Upsert config fields.
router.put(
  '/',
  asyncHandler(async (req, res) => {
    res.json(present(await configService.upsert(req.body || {})));
  })
);

// Token status: age, expiry, whether a refresh is due.
router.get(
  '/token/status',
  asyncHandler(async (req, res) => {
    res.json(tokenManager.status(await configService.getActive()));
  })
);

// Force a token refresh now.
router.post(
  '/token/refresh',
  asyncHandler(async (req, res) => {
    const refreshed = await tokenManager.regenerate(await configService.getActive());
    res.json(tokenManager.status(refreshed));
  })
);

module.exports = router;
