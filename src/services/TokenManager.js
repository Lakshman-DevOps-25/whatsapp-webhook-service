'use strict';

const config = require('../config');
const logger = require('../utils/logger');
const configService = require('./ConfigService');

const DAY_MS = 24 * 60 * 60 * 1000;

// Owns the access-token lifecycle:
//  - tokens are treated as valid for TTL_DAYS (default 60)
//  - at the REFRESH_THRESHOLD_DAYS mark (default 50) — or once expired — the
//    token is regenerated via the Graph API and persisted back to MongoDB.
//
// Regeneration uses Meta's long-lived token exchange (fb_exchange_token), which
// requires a still-valid token plus the app id/secret. (For a token that never
// expires, configure a System User permanent token in the Meta dashboard and
// the threshold check simply never triggers a refresh.)
class TokenManager {
  constructor() {
    this.cfg = config.token;
    this.wa = config.whatsapp;
  }

  ageInDays(issuedAt) {
    return (Date.now() - new Date(issuedAt).getTime()) / DAY_MS;
  }

  isExpired(expiresAt) {
    return !!expiresAt && Date.now() >= new Date(expiresAt).getTime();
  }

  needsRefresh(doc) {
    return this.ageInDays(doc.tokenIssuedAt) >= this.cfg.refreshThresholdDays || this.isExpired(doc.tokenExpiresAt);
  }

  // Ensure the active config holds a fresh token; refresh if past the threshold.
  async ensureFresh(doc) {
    const active = doc || (await configService.getActive());
    if (this.needsRefresh(active)) {
      logger.info(
        { phoneNumberId: active.phoneNumberId, ageDays: Math.floor(this.ageInDays(active.tokenIssuedAt)) },
        'Access token past refresh threshold — regenerating'
      );
      return this.regenerate(active);
    }
    return active;
  }

  // Convenience: return a guaranteed-fresh token string.
  async getValidToken() {
    const doc = await this.ensureFresh();
    return doc.accessToken;
  }

  // Exchange the current token for a new long-lived token and persist it.
  async regenerate(doc) {
    if (!this.wa.appId || !this.wa.appSecret) {
      logger.error('Cannot regenerate token: WHATSAPP_APP_ID / WHATSAPP_APP_SECRET not set');
      return doc; // keep the existing token rather than break sending
    }

    const url =
      `${this.wa.graphBaseUrl}/${this.wa.apiVersion}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(this.wa.appId)}` +
      `&client_secret=${encodeURIComponent(this.wa.appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(doc.accessToken)}`;

    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      logger.error({ status: res.status, error: data.error }, 'Token regeneration failed');
      throw new Error('Token regeneration failed: ' + (data.error?.message || res.statusText));
    }

    const issuedAt = new Date();
    const ttlSeconds = data.expires_in || this.cfg.ttlDays * 86400;
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    const updated = await configService.updateToken(doc.phoneNumberId, data.access_token, issuedAt, expiresAt);
    logger.info({ phoneNumberId: doc.phoneNumberId, tokenExpiresAt: expiresAt }, 'Access token regenerated and persisted');
    return updated;
  }

  status(doc) {
    const ageDays = this.ageInDays(doc.tokenIssuedAt);
    return {
      issuedAt: doc.tokenIssuedAt,
      expiresAt: doc.tokenExpiresAt,
      ageDays: Math.floor(ageDays),
      daysUntilExpiry: Math.ceil((new Date(doc.tokenExpiresAt).getTime() - Date.now()) / DAY_MS),
      needsRefresh: this.needsRefresh(doc),
    };
  }
}

module.exports = new TokenManager();
