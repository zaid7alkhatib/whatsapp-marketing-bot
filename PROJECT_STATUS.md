# Project Status (Pre-Live)

## Overview
The platform is a generic, metadata-driven conversational bot system built with Node.js, TypeScript, Express, MongoDB, and a React admin dashboard.

## What Has Been Built
- Backend modules for core entities (org units, channels, channel accounts, business partners, services, request types, content templates, flows, flow steps, sessions, messages, step responses, service requests).
- Bot engine for session start, message processing, transitions, outbound message creation, and session completion.
- Runtime inbound entrypoint that resolves or creates sessions and routes user messages into the bot engine.
- Frontend admin console with list/create/edit workflows and runtime testing support.
- Baileys integration layer with connection manager, status routes, and inbound/outbound text bridge hooks.

## Working Now
- End-to-end clinic WhatsApp intake flow behavior in platform runtime logic.
- Session creation/reuse, inbound/outbound message persistence, and step response persistence.
- Choice semantic normalization via `stepConfig.choiceMap`.
- Automatic `session.language` update when mapped semantic language is captured.
- Automatic `session.orgUnitId` update from mapped clinic selection (`stepConfig.orgUnitMap`).
- Service request auto-creation on flow completion with collected request data.
- Runtime and bot-engine behavior remains generic and flow-driven (no hardcoded clinic business logic in engine paths).

## WhatsApp Integration Status
- Baileys scaffolding and backend bridge are implemented.
- Incoming WhatsApp text messages can be normalized and routed through existing runtime logic.
- Outbound text replies can be sent back through Baileys from generated bot messages.
- Real WhatsApp number/device link is intentionally postponed by decision (not finalized yet).

## Current Readiness
- Core backend and frontend are stable for controlled staging/testing.
- Flow-driven automation, data capture, and service request creation are operational.
- System is technically ready for linked-device activation once a real number is provided.

## Known Optional Polish Items
- Add richer runtime observability (structured logs/metrics dashboards).
- Add message retry/queue strategy for provider send failures.
- Add stricter providerConfig validation UI/UX.
- Add media message handling and provider abstraction expansion in later phase.

## Next Major Milestone
Enable real WhatsApp linked-device connection with a dedicated number, execute first controlled live-message run, and complete operational verification using the go-live checklist.

