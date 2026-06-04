'use strict';

// Helpers to validate the shape of incoming WhatsApp Business API webhook
// payloads before we process them. We never trust raw input.

function isWhatsAppWebhook(body) {
  return !!body && body.object === 'whatsapp_business_account' && Array.isArray(body.entry);
}

// Flatten the nested entry[].changes[].value structure into a list of "value"
// objects, each of which may contain messages[], statuses[], metadata, contacts.
function extractValues(body) {
  const values = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change && change.value) values.push(change.value);
    }
  }
  return values;
}

// WhatsApp media-bearing message types.
const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];

function isMediaType(type) {
  return MEDIA_TYPES.includes(type);
}

module.exports = { isWhatsAppWebhook, extractValues, isMediaType, MEDIA_TYPES };
