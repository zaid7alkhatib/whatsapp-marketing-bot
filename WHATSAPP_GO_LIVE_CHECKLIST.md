# WhatsApp Marketing Go-Live Checklist

## Backend

- [ ] `.env` contains a production `MONGODB_URI`.
- [ ] `AUTH_TOKEN_SECRET` is replaced with a strong production secret.
- [ ] `CORS_ORIGINS` contains the production dashboard URL.
- [ ] `GET /health` returns `Server is running`.
- [ ] `GET /api/v1/system/readiness` returns `server: ok` and `database: ok`.

## WhatsApp Setup

- [ ] Create a channel with code `whatsapp` and provider `baileys`.
- [ ] Create a WhatsApp account linked to that channel.
- [ ] Open WhatsApp Pairing and scan the QR code from WhatsApp Linked Devices.
- [ ] Confirm the selected account status is `connected`.

## Marketing Campaigns

- [ ] Import a small approved test recipient list first.
- [ ] Confirm the preview exactly matches the message you want to send.
- [ ] Queue a test campaign and verify sent/failed/skipped counts.
- [ ] Reply from a test customer with `1` or `interested`.
- [ ] Confirm the Interested People page captures the reply.
- [ ] Confirm the customer receives: `Thank you for your interest. A member of our team will contact you shortly.`
- [ ] Review campaign history before sending to a larger approved list.
