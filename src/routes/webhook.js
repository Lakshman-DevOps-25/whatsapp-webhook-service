'use strict';

const express = require('express');
const verifySignature = require('../middleware/verifySignature');
const { asyncHandler } = require('../utils/errors');
const controller = require('../controllers/webhookController');

const router = express.Router();

// GET: Meta verification handshake (no signature on the GET).
router.get('/', asyncHandler(controller.verify));

// POST: incoming events — signature-verified before processing.
router.post('/', verifySignature, asyncHandler(controller.receive));

module.exports = router;
