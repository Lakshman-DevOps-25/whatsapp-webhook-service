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
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Compare against the env verify token (fall back to the stored config).
  let expected = config.whatsapp.verifyToken;
  try {
    const doc = await configService.getActive();
    expected = doc.verifyToken || expected;
  } catch (_) {
    /* config may not be bootstrapped yet; use env value */
  }

  if (mode === 'subscribe' && token && token === expected) {
    logger.info('Webhook verification succeeded');
    return res.status(200).send(challenge);
  }
  logger.warn('Webhook verification failed');
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
    const meta = await whatsAppService.getMediaMeta(mediaObj.id); // { url, mime_type }
    const { buffer } = await whatsAppService.downloadMedia(meta.url);
    const stored = await storageService.uploadInbound(message.id || mediaObj.id, buffer, meta.mime_type || mediaObj.mime_type);
    return messageService.save({
      ...base,
      text: mediaObj.caption,
      mediaId: mediaObj.id,
      mimeType: meta.mime_type || mediaObj.mime_type,
      mediaBucket: stored.bucket,
      mediaObjectPath: stored.objectName,
      mediaUrl: stored.url,
    });
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
      // Inbound messages
      for (const message of value.messages || []) {
        await handleInboundMessage(value, message);
      }
      // Outbound delivery statuses (sent/delivered/read/failed)
      for (const status of value.statuses || []) {
        await messageService.updateStatusByWaId(status.id, status.status);
      }
    }
  } catch (err) {
    logger.error({ error: err.message, stack: err.stack }, 'Failed processing webhook payload');
  }
}

module.exports = { verify, receive, handleInboundMessage };
