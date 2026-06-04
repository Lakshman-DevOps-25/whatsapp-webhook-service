'use strict';

const Message = require('../models/Message');
const logger = require('../utils/logger');

// Persists messages to MongoDB. Every write is logged (per requirements).
class MessageService {
  async save(doc) {
    // Log the data being stored (secrets are not part of message docs).
    logger.info(
      {
        collection: 'messages',
        direction: doc.direction,
        type: doc.type,
        waMessageId: doc.waMessageId,
        from: doc.from,
        to: doc.to,
        mediaObjectPath: doc.mediaObjectPath,
      },
      'Storing message to MongoDB'
    );
    return Message.create(doc);
  }

  async updateStatusByWaId(waMessageId, status) {
    logger.info({ collection: 'messages', waMessageId, status }, 'Updating outbound message status in MongoDB');
    return Message.findOneAndUpdate({ waMessageId, direction: 'outbound' }, { status }, { new: true });
  }

  list(filter = {}, limit = 100) {
    return Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  }
}

module.exports = new MessageService();
