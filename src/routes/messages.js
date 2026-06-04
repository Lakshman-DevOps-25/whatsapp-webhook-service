'use strict';

const express = require('express');
const { asyncHandler, HttpError } = require('../utils/errors');
const whatsAppService = require('../services/WhatsAppService');
const storageService = require('../services/StorageService');
const messageService = require('../services/MessageService');
const configService = require('../services/ConfigService');
const { isMediaType } = require('../utils/validators');

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
// Body:
//   text:  { to, type: "text", text }
//   media: { to, type: "image"|"video"|"audio"|"document", link, caption? }
//          (media at `link` is downloaded, stored under outbound/, then sent
//           to WhatsApp using a presigned MinIO URL)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { to, type = 'text', text, link, caption } = req.body || {};
    if (!to) throw new HttpError(400, 'recipient "to" is required');

    const doc = await configService.getActive();
    const base = { direction: 'outbound', phoneNumberId: doc.phoneNumberId, from: doc.phoneNumberId, to, type, timestamp: new Date() };

    if (type === 'text') {
      if (!text) throw new HttpError(400, 'text body is required for type "text"');
      const apiRes = await whatsAppService.sendText(to, text);
      const saved = await messageService.save({ ...base, text, waMessageId: apiRes.messages?.[0]?.id, status: 'sent' });
      return res.status(201).json(saved);
    }

    if (isMediaType(type)) {
      if (!link) throw new HttpError(400, 'a media "link" is required for media types');
      // Download the provided media and persist a copy under outbound/.
      const { buffer, contentType } = await whatsAppService.downloadUrl(link);
      const stored = await storageService.uploadOutbound(`${Date.now()}`, buffer, contentType);
      // Send to WhatsApp via the stored copy's presigned URL (publicly fetchable).
      const apiRes = await whatsAppService.sendMediaByLink(to, type, stored.url || link, caption);
      const saved = await messageService.save({
        ...base,
        text: caption,
        mimeType: contentType,
        mediaBucket: stored.bucket,
        mediaObjectPath: stored.objectName,
        mediaUrl: stored.url,
        waMessageId: apiRes.messages?.[0]?.id,
        status: 'sent',
      });
      return res.status(201).json(saved);
    }

    throw new HttpError(400, `unsupported message type: ${type}`);
  })
);

module.exports = router;
