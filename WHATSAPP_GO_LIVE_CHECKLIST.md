# WhatsApp Linked-Device Go-Live Checklist

Use this checklist when the real WhatsApp business/test number is available and ready to be linked.

## 1. Environment Readiness
- [ ] `.env` is present and valid (`MONGODB_URI`, `PORT`, and related app settings).
- [ ] MongoDB is running and reachable.
- [ ] Baileys auth base path is writable (for multi-file auth state).

## 2. Backend Start
- [ ] Install dependencies: `npm install`
- [ ] Build check passes: `npm run build`
- [ ] Start backend: `npm run dev`
- [ ] Health endpoint is OK: `GET /health`
- [ ] Readiness endpoint is OK: `GET /api/v1/system/readiness`

## 3. Frontend Optional Verification
- [ ] Admin dashboard starts and loads.
- [ ] Runtime Test page can call backend successfully.
- [ ] Key master-data pages load expected records.

## 4. Channel and Channel Account Verification
- [ ] Target channel is Baileys-compatible (`code=whatsapp` or `provider=baileys`).
- [ ] Channel status is `active`.
- [ ] Target channel account exists and is selectable for go-live test.

## 5. ProviderConfig Defaults Verification
- [ ] Channel account `providerConfig` contains valid runtime defaults for first-session creation:
  - [ ] `runtimeFlowId` (or `defaultFlowId` / `flowId`)
  - [ ] `runtimeLanguage` (or `defaultLanguage` / `language`)
  - [ ] optional `runtimeOrgUnitId` / `runtimeBusinessPartnerId` (if used)
- [ ] Referenced IDs exist and are valid ObjectIds.

## 6. Baileys Start / Status / Logout API Checks
- [ ] Start integration:
  - `POST /api/v1/baileys/start/:channelAccountId`
- [ ] Confirm runtime status:
  - `GET /api/v1/baileys/status/:channelAccountId`
- [ ] Confirm safe logout path:
  - `POST /api/v1/baileys/logout/:channelAccountId`

## 7. QR / Linked-Device Connection
- [ ] Start Baileys for the target channel account.
- [ ] Retrieve/observe QR availability from status/logs.
- [ ] Link the real WhatsApp device using Linked Devices flow.
- [ ] Confirm status transitions to connected.

## 8. First Inbound Message Test
- [ ] Send a plain text message from the real test user to the linked number.
- [ ] Confirm backend logs show incoming WhatsApp text normalization and runtime bridge handling.

## 9. Session Creation / Reuse Verification
- [ ] Verify session is created when no active session exists.
- [ ] Verify active session is reused on next inbound message from same user/account.
- [ ] Confirm `bot_sessions` fields update as expected (`statusCode`, `currentStepCode`, `lastActivityAt`).

## 10. Outbound Message Verification
- [ ] Confirm bot-generated outbound messages are persisted in `messages`.
- [ ] Confirm outbound text is actually sent back to WhatsApp user.
- [ ] Confirm outbound order matches bot-engine generated sequence.

## 11. Service Request Verification
- [ ] Complete flow to end step.
- [ ] Confirm service request is auto-created when flow settings require it.
- [ ] Confirm request payload uses collected data and snapshots as expected.

## 12. Logout / Reconnect Check
- [ ] Execute logout endpoint.
- [ ] Confirm status becomes disconnected/not initialized as expected.
- [ ] Re-run start and confirm reconnection behavior is healthy.

## Go-Live Caution
- Use a dedicated business/test number for first activation.
- Verify `providerConfig` defaults before first live inbound message.
- Monitor backend logs closely during the first live run window.

