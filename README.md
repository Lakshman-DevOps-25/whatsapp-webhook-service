# whatsapp-webhook-service

A production-ready **WhatsApp Business (Cloud API) webhook service** in Node.js/Express. It manages WhatsApp configuration and access-token lifecycle, validates inbound webhooks, persists messages to **MongoDB**, and stores media in **MinIO** (`inbound/` and `outbound/` folders).

## What it does

- **Configuration management** — stores the WhatsApp config in MongoDB, bootstrapped from environment variables on first run; fetch it on demand via `GET /config`.
- **Token lifecycle** — treats the access token as valid for `TOKEN_TTL_DAYS` (default 60). A check (on demand, before every API call, and on a periodic timer) regenerates the token once it reaches `TOKEN_REFRESH_THRESHOLD_DAYS` (default 50) or has expired, then persists the new token to MongoDB.
- **Webhooks** — `GET /webhook` handles Meta's verification handshake; `POST /webhook` validates the `X-Hub-Signature-256` signature, then processes inbound messages and outbound delivery statuses.
- **Message persistence** — inbound and outbound messages are stored in MongoDB with sender, recipient, timestamp, content, type, direction and (for media) the MinIO object path.
- **Media handling** — inbound media is downloaded from WhatsApp and stored under `inbound/`; outbound media is stored under `outbound/`.
- **Logging** — structured JSON logs (pino) to stdout. Every write to MongoDB is logged. On **Render.com**, stdout/stderr are captured automatically and visible under the service's **Logs** tab.

## Project structure

```
src/
├── index.js                  # bootstrap: Mongo, MinIO bucket, config, token timer, server
├── app.js                    # Express wiring (raw-body capture for signature)
├── config/index.js           # all env-driven configuration (no hardcoded values)
├── db/mongo.js               # Mongo connection (retry)
├── models/                   # WhatsAppConfig, Message
├── services/
│   ├── ConfigService.js      # config CRUD + bootstrap in Mongo
│   ├── TokenManager.js       # 60-day TTL, 50-day refresh, fb_exchange_token, persist
│   ├── WhatsAppService.js    # Graph API: send text/media, fetch + download media
│   ├── StorageService.js     # MinIO uploads (inbound/outbound) + presigned URLs
│   └── MessageService.js     # message persistence (logs every write)
├── controllers/webhookController.js   # verify + receive
├── routes/                   # webhook, messages, config, health
├── middleware/               # verifySignature (HMAC), errorHandler
└── utils/                    # logger, validators, errors
```

## Quick start

```bash
cp .env.example .env          # then fill in your values
npm install
npm start                     # http://localhost:3000
```

You need a reachable **MongoDB** and **MinIO**. To expose the local webhook to Meta during development, tunnel it (e.g. `ngrok http 3000`) and register the public URL + `WHATSAPP_VERIFY_TOKEN` in the Meta App dashboard.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness + Mongo status |
| GET | `/webhook` | Meta verification handshake (`hub.challenge`) |
| POST | `/webhook` | Receive inbound messages + outbound statuses (signature-verified) |
| GET | `/messages?direction=` | List stored messages |
| POST | `/messages` | Send outbound text/media (see below) |
| GET | `/config` | Fetch config (access token masked) |
| PUT | `/config` | Upsert config fields |
| GET | `/config/token/status` | Token age, expiry, whether a refresh is due |
| POST | `/config/token/refresh` | Force a token refresh now |

### Sending outbound messages

```bash
# Text
curl -X POST http://localhost:3000/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"15551234567","type":"text","text":"Hello from the service"}'

# Media (downloaded, stored under outbound/, then sent via a presigned URL)
curl -X POST http://localhost:3000/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"15551234567","type":"image","link":"https://example.com/pic.jpg","caption":"hi"}'
```

## Deploying to Render.com

A `render.yaml` blueprint is included (web service, `npm start`, health check at `/health`). Set the secret env vars (`MONGO_URI`, `WHATSAPP_*`, `MINIO_*`) in the Render dashboard. Logs appear under the service's **Logs** tab and via `render logs`.

## Important real-world notes

- **MinIO endpoint/port.** The public sandbox **console** is `https://play.min.io:9443`, but the MinIO SDK needs the **S3 API** endpoint, which for the playground is `play.min.io` over TLS (port 443/9000). `.env.example` is set accordingly. `play.min.io` is a shared, periodically-wiped public sandbox — point `MINIO_*` at your own MinIO for anything real.
- **Token "regeneration".** Meta has no generic "regenerate" call. This service refreshes by exchanging the current token for a long-lived one via `oauth/access_token?grant_type=fb_exchange_token` (needs `WHATSAPP_APP_ID` + `WHATSAPP_APP_SECRET` and a still-valid token). If you instead configure a **System User permanent token**, it never expires and the threshold check simply never fires. If a refresh fails, the existing token is kept and the error is logged rather than breaking sends.
- **Outbound media via link.** Media is sent using the stored object's presigned URL, so WhatsApp must be able to reach it over public HTTPS (true for `play.min.io`; for a private MinIO, expose it or upload to WhatsApp's `/media` endpoint instead).
- **Signature verification** is skipped (with a warning) only when `WHATSAPP_APP_SECRET` is unset, to ease local testing. Always set it in production.

## Troubleshooting

- **Inbound media not appearing in MinIO (but text + outbound media work).** Meta's media endpoints reject requests without a `User-Agent` header (HTTP 400). The service sends `WHATSAPP_MEDIA_USER_AGENT` on both the media-metadata lookup and the binary download. If a download still fails, the inbound message is saved to MongoDB with a `mediaError` field and the failure is logged at `error` level — check the logs for the exact status/body. (Outbound media is unaffected because it is fetched from a plain public `link`, which needs no header.)
- **Outbound messages not appearing in MongoDB/MinIO.** The outbound record is now persisted (and media stored under `outbound/`) *before* the WhatsApp send is attempted, so a record always exists. If the WhatsApp API rejects the send — common causes: messaging outside the 24-hour customer-service window (needs an approved template), the recipient is not allow-listed for a test number, or the access token is invalid/expired — the record is saved with `status: "failed"` and a `sendError`, the failure is logged, and the endpoint returns HTTP 502 (with the persisted message in the response). A successful send returns 201 with `status: "sent"`.
