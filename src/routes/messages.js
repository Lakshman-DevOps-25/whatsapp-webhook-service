'use strict';

const express = require('express');
const { asyncHandler, HttpError } = require('../utils/errors');
const logger = require('../utils/logger');
const whatsAppService = require('../services/WhatsAppService');
const storageService = require('../services/StorageService');
const messageService = require('../services/MessageService');
const configService = require('../services/ConfigService');
const { isMediaType } = require('../utils/validators');
const tokenManager = require('../services/TokenManager');

const router = express.Router();

// List stored messages (optional ?direction=inbound|outbound).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.direction) filter.direction = req.query.direction;
    res.json({ data: await messageService.list(filter) });
  })
);

// Send an OUTBOUND message or media.
//   text:  { to, type: "text", text }
//   media: { to, type: "image"|"video"|"audio"|"document", link, caption? }
//
// IMPORTANT: the message is persisted to MongoDB (and media to MinIO) BEFORE the
// WhatsApp send is attempted, so an outbound record always exists even when the
// WhatsApp API rejects the send (e.g. outside the 24h window, un-allow-listed
// recipient, expired token). The send outcome is then written back as the
// status ("sent" or "failed", with sendError).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { to, type = 'text', text, link, caption } = req.body || {};
    if (!to) throw new HttpError(400, 'recipient "to" is required');

    // const doc = await configService.getActive();
    const doc = await configService.getActive();

    console.log("Before refresh:");
    console.log(doc.accessToken.substring(0,40));

    await tokenManager.ensureFresh(doc);

    const fresh = await configService.getActive();

    console.log("After refresh:");
    console.log(fresh.accessToken.substring(0,40));

    console.log(
        "Same token:",
        doc.accessToken === fresh.accessToken
    );
    const record = {
      direction: 'outbound',
      phoneNumberId: doc.phoneNumberId,
      from: doc.phoneNumberId,
      to,
      type,
      timestamp: new Date(),
      status: 'pending',
    };

    if (type === 'text') {
      if (!text) throw new HttpError(400, 'text body is required for type "text"');
      record.text = text;
    } else if (isMediaType(type)) {
      if (!link) throw new HttpError(400, 'a media "link" is required for media types');
      record.text = caption;
      // Store a copy of the media under outbound/ BEFORE sending.
      try {
        const { buffer, contentType } = await whatsAppService.downloadUrl(link);
        const stored = await storageService.uploadOutbound(`${Date.now()}`, buffer, contentType);
        record.mimeType = contentType;
        record.mediaBucket = stored.bucket;
        record.mediaObjectPath = stored.objectName;
        record.mediaUrl = stored.url || link;
      } catch (err) {
        logger.error({ error: err.message, link }, 'Outbound media download/upload failed');
        record.mediaError = err.message;
        record.mediaUrl = link; // fall back to the caller-provided link for sending
      }
    } else {
      throw new HttpError(400, `unsupported message type: ${type}`);
    }

    // 1) Persist first — the outbound message is always recorded.
    const saved = await messageService.save(record);

    // 2) Attempt the WhatsApp send and reflect the outcome on the record.
    try {
      const apiRes =
        type === 'text'
          ? await whatsAppService.sendText(to, text)
          : await whatsAppService.sendMediaByLink(to, type, record.mediaUrl, caption);
      const updated = await messageService.updateById(saved._id, {
        status: 'sent',
        waMessageId: apiRes.messages?.[0]?.id,
      });
      return res.status(201).json(updated);
    } catch (err) {
      logger.error({ error: err.message, to, type }, 'WhatsApp send failed (message already persisted)');
      const updated = await messageService.updateById(saved._id, { status: 'failed', sendError: err.message });
      // The record + media are stored; signal the send failure to the caller.
      return res.status(502).json({ error: 'send failed', sendError: err.message, message: updated });
    }
  })
);

module.exports = router;
