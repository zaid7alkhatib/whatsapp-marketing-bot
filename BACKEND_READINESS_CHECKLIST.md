# Backend Readiness Checklist (Before Baileys Integration)

Use this checklist before starting WhatsApp/Baileys provider work.

## Environment
- [ ] `.env` is present and contains valid `MONGODB_URI` and `PORT`.
- [ ] `NODE_ENV` is set appropriately (`development` or `production`).
- [ ] `BAILEYS_AUTH_BASE_PATH` is set if you want a custom Baileys auth folder (optional, defaults to `.baileys-auth`).

## Core Runtime Health
- [ ] Backend starts successfully (`npm run dev` or `npm run build && npm start`).
- [ ] `GET /health` returns `success: true`.
- [ ] `GET /api/v1/system/readiness` returns `server: ok`, `runtime: ok`, and `database: ok`.

## Data and Configuration Prerequisites
- [ ] At least one active flow exists with valid `startStepCode`.
- [ ] Required flow steps exist for the tested flow.
- [ ] At least one channel exists.
- [ ] At least one channel account exists and references a valid channel.
- [ ] Required content templates for tested steps exist.

## Bot Engine and Runtime Verification
- [ ] `POST /api/v1/bot-engine/start-session` works with valid references.
- [ ] `POST /api/v1/bot-engine/process-message` creates inbound message + step response.
- [ ] Outbound bot messages are persisted when content is resolved.
- [ ] Session `collectedData` updates correctly for capture steps.

## Service Request Automation
- [ ] Flow completion to `end` updates session status to `completed`.
- [ ] Auto service-request creation works when flow settings require it.
- [ ] Service request snapshots (`service`, `requestType`, optional `orgUnit`) are populated.

## Frontend Verification
- [ ] Runtime Test page can send inbound messages successfully.
- [ ] List and detail pages load without backend response-shape issues.
- [ ] Search/filter/sort/pagination behavior remains functional after backend changes.
