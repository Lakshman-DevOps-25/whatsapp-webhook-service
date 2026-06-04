'use strict';

const WhatsAppConfig = require('../models/WhatsAppConfig');
const config = require('../config');
const logger = require('../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

// Manages the WhatsApp configuration document in MongoDB.
class ConfigService {
  // Returns the active config, bootstrapping it from environment variables on
  // first run if it does not yet exist.
  async getActive() {
    const phoneNumberId = config.whatsapp.phoneNumberId;
    if (!phoneNumberId) {
      throw new Error('WHATSAPP_PHONE_NUMBER_ID is not configured');
    }

    let doc = await WhatsAppConfig.findById(phoneNumberId);
    if (!doc) {
      doc = await this.bootstrapFromEnv();
    }
    return doc;
  }

  // Create the initial config document from env (initial token lasts ttlDays).
  async bootstrapFromEnv() {
    const w = config.whatsapp;
    if (!w.accessToken) {
      throw new Error('WHATSAPP_ACCESS_TOKEN is required to bootstrap configuration');
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.token.ttlDays * DAY_MS);

    const payload = {
      _id: w.phoneNumberId,
      phoneNumberId: w.phoneNumberId,
      businessAccountId: w.businessAccountId,
      appId: w.appId,
      displayName: w.displayName,
      graphApiVersion: w.apiVersion,
      accessToken: w.accessToken,
      tokenIssuedAt: now,
      tokenExpiresAt: expiresAt,
      verifyToken: w.verifyToken,
    };

    logger.info(
      { collection: 'whatsappconfigs', phoneNumberId: payload.phoneNumberId, tokenExpiresAt: payload.tokenExpiresAt },
      'Storing WhatsApp config to MongoDB (bootstrap)'
    );
    return WhatsAppConfig.findByIdAndUpdate(w.phoneNumberId, payload, { upsert: true, new: true });
  }

  // Persist a refreshed token + new issue/expiry timestamps.
  async updateToken(phoneNumberId, accessToken, issuedAt, expiresAt) {
    logger.info(
      { collection: 'whatsappconfigs', phoneNumberId, tokenIssuedAt: issuedAt, tokenExpiresAt: expiresAt },
      'Storing refreshed WhatsApp token to MongoDB'
    );
    return WhatsAppConfig.findByIdAndUpdate(
      phoneNumberId,
      { accessToken, tokenIssuedAt: issuedAt, tokenExpiresAt: expiresAt },
      { new: true }
    );
  }

  // Upsert arbitrary config fields (used by the admin /config endpoint).
  async upsert(fields) {
    const phoneNumberId = fields.phoneNumberId || config.whatsapp.phoneNumberId;
    logger.info({ collection: 'whatsappconfigs', phoneNumberId }, 'Storing WhatsApp config update to MongoDB');
    return WhatsAppConfig.findByIdAndUpdate(phoneNumberId, { _id: phoneNumberId, ...fields }, { upsert: true, new: true });
  }
}

module.exports = new ConfigService();
