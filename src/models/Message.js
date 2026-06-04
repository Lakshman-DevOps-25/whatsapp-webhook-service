'use strict';

const { Schema, model } = require('mongoose');
const { randomUUID } = require('crypto');

// One document per inbound or outbound message (text or media).
const messageSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    waMessageId: { type: String, index: true }, // WhatsApp's wamid
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    phoneNumberId: { type: String },
    from: { type: String },
    to: { type: String },
    type: { type: String, default: 'text' }, // text | image | video | audio | document | sticker
    text: { type: String },

    // Media metadata (when type !== text)
    mediaId: { type: String },
    mimeType: { type: String },
    mediaBucket: { type: String },
    mediaObjectPath: { type: String }, // e.g. inbound/<wamid>.jpg
    mediaUrl: { type: String }, // presigned MinIO URL

    status: { type: String }, // outbound status: sent | delivered | read | failed
    timestamp: { type: Date },
    raw: { type: Schema.Types.Mixed }, // original payload fragment, for debugging
  },
  { timestamps: true, versionKey: false, _id: false }
);

module.exports = model('Message', messageSchema);
