'use strict';

const config = require('../config');
const logger = require('../utils/logger');
const tokenManager = require('./TokenManager');
const configService = require('./ConfigService');

// Thin client over the WhatsApp Cloud (Graph) API. Always pulls a fresh token
// from the TokenManager before each call.
class WhatsAppService {
  constructor() {
    this.wa = config.whatsapp;
  }

  baseUrl() {
    return `${this.wa.graphBaseUrl}/${this.wa.apiVersion}`;
  }

  async _context() {
    const doc = await configService.getActive();
    await tokenManager.ensureFresh(doc);
    const fresh = await configService.getActive();
    return { token: fresh.accessToken, phoneNumberId: fresh.phoneNumberId };
  }

  // Send a plain text message. Returns the WhatsApp API response.
  async sendText(to, body) {
    const { token, phoneNumberId } = await this._context();
    const res = await fetch(`${this.baseUrl()}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('sendText failed: ' + JSON.stringify(data.error || data));
    return data;
  }

  // Send media by public link (e.g. a presigned MinIO URL).
  async sendMediaByLink(to, type, link, caption) {
    const { token, phoneNumberId } = await this._context();
    const payload = { messaging_product: 'whatsapp', to, type, [type]: { link } };
    if (caption && (type === 'image' || type === 'video' || type === 'document')) payload[type].caption = caption;
    const res = await fetch(`${this.baseUrl()}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('sendMediaByLink failed: ' + JSON.stringify(data.error || data));
    return data;
  }

  // Resolve a media id to its temporary download URL + mime type.
  async getMediaMeta(mediaId) {
    const { token } = await this._context();
    // Meta requires a User-Agent on ALL media-related requests; without it the
    // endpoint returns 400. This is why inbound media downloads were failing.
    const res = await fetch(`${this.baseUrl()}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': this.wa.mediaUserAgent },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`getMediaMeta failed (${res.status}): ` + JSON.stringify(data.error || data));
    return data; // { url, mime_type, sha256, file_size, id }
  }

  // Download binary media from a Graph media URL. Requires BOTH the bearer token
  // and a User-Agent header (Meta rejects header-less requests with 400).
  async downloadMedia(mediaUrl) {
    const { token } = await this._context();
    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': this.wa.mediaUserAgent },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`downloadMedia failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  // Download an arbitrary public URL (used for outbound media supplied by link).
  async downloadUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('downloadUrl failed: ' + res.status);
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }
}

module.exports = new WhatsAppService();
