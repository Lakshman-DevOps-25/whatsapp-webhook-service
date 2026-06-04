'use strict';

const { Client } = require('minio');
const { randomUUID } = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

// Maps common WhatsApp mime types to file extensions for nicer object names.
const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
};

// Wraps the MinIO SDK. Inbound media -> `<inboundPrefix>/...`,
// outbound media -> `<outboundPrefix>/...`.
class StorageService {
  constructor() {
    this.cfg = config.minio;
    this.client = new Client({
      endPoint: this.cfg.endPoint,
      port: this.cfg.port,
      useSSL: this.cfg.useSSL,
      accessKey: this.cfg.accessKey,
      secretKey: this.cfg.secretKey,
    });
  }

  async ensureBucket() {
    const exists = await this.client.bucketExists(this.cfg.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.cfg.bucket, 'us-east-1');
      logger.info({ bucket: this.cfg.bucket }, 'Created MinIO bucket');
    } else {
      logger.info({ bucket: this.cfg.bucket }, 'MinIO bucket ready');
    }
  }

  objectName(prefix, id, mimeType) {
    const ext = EXT_BY_MIME[mimeType] || 'bin';
    const safeId = (id || randomUUID()).replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${prefix}/${safeId}.${ext}`;
  }

  async _put(prefix, id, buffer, mimeType) {
    const name = this.objectName(prefix, id, mimeType);
    await this.client.putObject(this.cfg.bucket, name, buffer, buffer.length, { 'Content-Type': mimeType });
    const url = await this.client
      .presignedGetObject(this.cfg.bucket, name, this.cfg.presignExpirySeconds)
      .catch(() => null);
    logger.info({ bucket: this.cfg.bucket, objectName: name, size: buffer.length }, 'Stored media object to MinIO');
    return { bucket: this.cfg.bucket, objectName: name, url };
  }

  uploadInbound(id, buffer, mimeType) {
    return this._put(this.cfg.inboundPrefix, id, buffer, mimeType);
  }

  uploadOutbound(id, buffer, mimeType) {
    return this._put(this.cfg.outboundPrefix, id, buffer, mimeType);
  }
}

module.exports = new StorageService();
