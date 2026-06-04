'use strict';

const { Schema, model } = require('mongoose');

// Persisted WhatsApp configuration + token lifecycle state.
// NOTE: the app secret is intentionally NOT stored here — it stays in env and
// is used only for signature verification and token exchange.
const whatsAppConfigSchema = new Schema(
  {
    _id: { type: String }, // phoneNumberId is the natural key
    phoneNumberId: { type: String, required: true },
    businessAccountId: { type: String },
    appId: { type: String },
    displayName: { type: String },
    graphApiVersion: { type: String },

    accessToken: { type: String, required: true },
    tokenIssuedAt: { type: Date, required: true },
    tokenExpiresAt: { type: Date, required: true },

    verifyToken: { type: String },
  },
  { timestamps: true, versionKey: false, _id: false }
);

module.exports = model('WhatsAppConfig', whatsAppConfigSchema);
