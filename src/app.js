'use strict';

const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

const webhookRoutes = require('./routes/webhook');
const messageRoutes = require('./routes/messages');
const configRoutes = require('./routes/config');
const healthRoutes = require('./routes/health');

function createApp() {
  const app = express();

  // Capture the raw body so the webhook signature middleware can HMAC it.
  app.use(
    express.json({
      limit: '5mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(pinoHttp({ logger }));

  app.get('/', (req, res) =>
    res.json({
      name: 'whatsapp-webhook-service',
      version: '1.0.0',
      endpoints: ['GET /health', 'GET|POST /webhook', 'GET|POST /messages', 'GET|PUT /config', 'GET /config/token/status', 'POST /config/token/refresh'],
    })
  );

  app.use('/health', healthRoutes);
  app.use('/webhook', webhookRoutes);
  app.use('/messages', messageRoutes);
  app.use('/config', configRoutes);

  app.use((req, res) => res.status(404).json({ error: 'not found' }));
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
