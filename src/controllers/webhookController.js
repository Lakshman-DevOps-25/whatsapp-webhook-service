'use strict';

const config = require('../config');
const logger = require('../utils/logger');
const { isWhatsAppWebhook, extractValues, isMediaType } = require('../utils/validators');
const whatsAppService = require('../services/WhatsAppService');
const storageService = require('../services/StorageService');
const messageService = require('../services/MessageService');
const configService = require('../services/ConfigService');

// GET /webhook — Meta verification handshake.
async function verify(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const VERIFY_TOKEN = "whatsap-webhook";

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      return res
          .status(200)
          .type("text/plain")
          .send(challenge);
  }
  return res.sendStatus(403);
}

// Handle a single inbound message (text or media).
async function handleInboundMessage(value, message) {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const from = message.from;
  const to = phoneNumberId;
  const base = {
    waMessageId: message.id,
    direction: 'inbound',
    phoneNumberId,
    from,
    to,
    type: message.type,
    timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
    raw: message,
  };

  if (message.type === 'text') {
    return messageService.save({ ...base, text: message.text?.body });
  }

  if (isMediaType(message.type)) {
    const mediaObj = message[message.type]; // { id, mime_type, caption? }
    try {
      const meta = await whatsAppService.getMediaMeta(mediaObj.id); // { url, mime_type }
      const { buffer } = await whatsAppService.downloadMedia(meta.url);
      const mimeType = meta.mime_type || mediaObj.mime_type;
      const stored = await storageService.uploadInbound(message.id || mediaObj.id, buffer, mimeType);
      return messageService.save({
        ...base,
        text: mediaObj.caption,
        mediaId: mediaObj.id,
        mimeType,
        mediaBucket: stored.bucket,
        mediaObjectPath: stored.objectName,
        mediaUrl: stored.url,
      });
    } catch (err) {
      // Do NOT silently drop the media: log loudly and still record the message
      // (with the error) so there is a MongoDB trail to debug against.
      logger.error(
        { error: err.message, mediaId: mediaObj.id, waMessageId: message.id, type: message.type },
        'Inbound media download/upload failed'
      );
      return messageService.save({
        ...base,
        text: mediaObj.caption,
        mediaId: mediaObj.id,
        mimeType: mediaObj.mime_type,
        mediaError: err.message,
      });
    }
  }

  // Unsupported type — still record it for visibility.
  return messageService.save(base);
}

// POST /webhook — receives inbound messages and outbound status updates.
async function receive(req, res) {
  const body = req.body;

  if (!isWhatsAppWebhook(body)) {
    logger.warn('Received non-WhatsApp or malformed webhook payload');
    return res.sendStatus(400);
  }

  // Acknowledge immediately so Meta does not retry; process within try/catch.
  res.sendStatus(200);

  try {
    for (const value of extractValues(body)) {
      // Inbound messages — isolate each so one failure doesn't drop the rest.
      for (const message of value.messages || []) {
        try {
          await handleInboundMessage(value, message);
        } catch (err) {
          logger.error({ error: err.message, waMessageId: message.id }, 'Failed processing inbound message');
        }
      }
      // Outbound delivery statuses (sent/delivered/read/failed)
      for (const status of value.statuses || []) {
        await messageService.updateStatusByWaId(status.id, status.status).catch((e) =>
          logger.error({ error: e.message, waMessageId: status.id }, 'Failed updating status')
        );
      }
    }
  } catch (err) {
    logger.error({ error: err.message, stack: err.stack }, 'Failed processing webhook payload');
  }
}

module.exports = { verify, receive, handleInboundMessage };
