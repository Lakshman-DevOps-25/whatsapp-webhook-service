'use strict';

// Centralized, env-driven configuration. No hardcoded secrets or endpoints —
// every value can be overridden through environment variables.
require('dotenv').config();

const bool = (v, d = false) => (v == null ? d : String(v).toLowerCase() === 'true');
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  logLevel: process.env.LOG_LEVEL || 'info',

  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/whatsapp_service',
  },

  whatsapp: {
    graphBaseUrl: process.env.WHATSAPP_GRAPH_BASE_URL || 'https://graph.facebook.com',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v19.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    displayName: process.env.WHATSAPP_DISPLAY_NAME || 'WhatsApp Number',
    appId: process.env.WHATSAPP_APP_ID || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    // Meta requires a non-empty User-Agent on media download requests.
    mediaUserAgent: process.env.WHATSAPP_MEDIA_USER_AGENT || 'whatsapp-webhook-service/1.0',
  },

  token: {
    ttlDays: int(process.env.TOKEN_TTL_DAYS, 60),
    refreshThresholdDays: int(process.env.TOKEN_REFRESH_THRESHOLD_DAYS, 50),
    checkIntervalHours: int(process.env.TOKEN_CHECK_INTERVAL_HOURS, 24),
  },

  minio: {
    endPoint: process.env.MINIO_ENDPOINT || 'play.min.io',
    port: int(process.env.MINIO_PORT, 443),
    useSSL: bool(process.env.MINIO_USE_SSL, true),
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
    bucket: process.env.MINIO_BUCKET || 'whatsapp-media',
    inboundPrefix: process.env.MINIO_INBOUND_PREFIX || 'inbound',
    outboundPrefix: process.env.MINIO_OUTBOUND_PREFIX || 'outbound',
    presignExpirySeconds: int(process.env.MINIO_PRESIGN_EXPIRY_SECONDS, 604800),
  },
};

module.exports = config;
