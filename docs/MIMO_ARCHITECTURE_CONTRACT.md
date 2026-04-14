# MiMo Client -> Therapist Contract

This document defines the contract that the **client build** in `Signal-Desktop-client` must satisfy when talking to the therapist build.

It also records the current implementation boundary of this repo, because this checkout does **not** yet contain the full MiMo client runtime described in earlier planning documents.

## 1. Roles

| Role | Meaning |
| --- | --- |
| MiMo client | The Signal Desktop based app running on the participant device |
| Therapist build | The therapist-side Signal Desktop fork that monitors sessions and receives MiMo metadata |
| Orchestrator | Optional future service that assigns sessions, forwards events, or reconciles ids |

## 2. Current implementation in this repo

The client repo currently contains only a small part of the MiMo integration surface:

- `app/mimo_ingest_http.main.ts`
  - starts a localhost-only HTTP server,
  - accepts `POST /mimo-metadata`,
  - exposes `GET /mimo-metadata` for local status inspection,
  - validates `clientSessionId`,
  - forwards payloads to the renderer through `mimo-ingest-metadata`.
- `app/mimo_metadata_store.main.ts`
  - keeps the latest in-memory snapshot per `clientSessionId`,
  - backs the local GET status endpoint.
- `app/main.main.ts`
  - starts the ingest server,
  - provides a demo metadata dispatch path.
- `app/menu.std.ts`
  - exposes `View -> Simulate MiMo Client Metadata`.
- `mimo_metadata_monitor.html` + `js/mimo_metadata_monitor.js`
  - provide a local debug monitor for `GET /mimo-metadata`.

This means the repo contains a **bridge/demo HTTP path** plus a **Signal-native participant → therapist path** (see below). Game SDK / full orchestration are still out of scope here.

**Also implemented (participant → therapist over Signal):**

- `ts/services/mimoMessageSender.preload.ts` — `sendMiMoHeartbeatToTherapist`, `sendMiMoAlertToTherapist`, `sendMiMoSessionStateToTherapist` (MiMo envelope on `DataMessage.body`).
- `ts/state/smart/MiMoTherapistMetadataProvider.preload.tsx` — while in an accepted **direct** call, periodic heartbeats + direct-call rules to the remote peer; while in **group / call-link**, heartbeats to `MIMO_THERAPIST_SERVICE_ID` (see IPC below).
- `app/main.main.ts` — `mimo:get-therapist-service-id` IPC reads **`MIMO_THERAPIST_SERVICE_ID`** for group targeting.
- `ts/services/mimoDirectCallRules.preload.ts` / `mimoGroupCallRules.preload.ts` — minimal rule sets feeding `alerts[]` on heartbeats (explicit `[]` clears therapist state).

## 3. Canonical payload

The shared minimum payload is:

```ts
type MiMoMetadataIngestPayload = {
  clientSessionId: string;
  gameId?: string | null;
  heartbeatUnixMs?: number;
};
```

### Rules

- `clientSessionId` is required.
- `clientSessionId` must be stable for the duration of a therapy shift.
- `gameId` is optional and may be `null` when no game or module is active.
- `heartbeatUnixMs` is optional but should be present for heartbeat-style updates.

## 4. Identity mapping

The preferred client strategy remains:

- set `clientSessionId` equal to the client's Signal identity key used by the therapist-side correlation logic,
- preferably the participant ACI or service id,
- only use an opaque id if an orchestrator will translate it before therapist-side consumption.

Reason: the therapist shell correlates MiMo rows with active RingRTC participants by matching `clientSessionId` against Signal participant identifiers.

## 5. Transport contract

The client contract supports two transport paths for the same logical payload.

### A. HTTP bridge path

For co-located setups, demos, or temporary bridges:

- destination: `http://127.0.0.1:8765/mimo-metadata`
- status/debug: `GET http://127.0.0.1:8765/mimo-metadata`
- override port: `MIMO_INGEST_PORT`
- method: `POST`
- content type: JSON

The HTTP **receiver** remains for local tools. **Periodic sending** to a remote therapist is **not** done over HTTP from the participant device (loopback ingest is local). Use the **Signal path** (below) for production-style delivery.

### B. Signal-native path

For real client-to-therapist delivery across machines:

- use Signal `DataMessage.body`,
- wrap MiMo messages in a MiMo-specific envelope,
- keep these messages out of normal user chat surfaces.

This path is **implemented** for participant → therapist: `heartbeat`, `alert`, and `session_state` message kinds are sent from the client build and handled on the therapist build (`mimoMessageHandler.preload.ts` → `mimoSession.ingestMetadata`). Chat UX for invisible MiMo traffic is not customized beyond the `\x00MIMO\x01` envelope prefix.

## 6. Expected client behaviors

### Metadata heartbeat (current)

- Emit periodic heartbeats while a **monitored** call is active (direct: remote peer; group/adhoc: therapist service id from env).
- Include `clientSessionId` (defaults to local ACI in heartbeats).
- Include `heartbeatUnixMs`, `sessionStatus`, `connectivityState`, and **`alerts`** (use `[]` to clear prior alerts on the therapist).
- `gameId` when a game/module reporter exists (optional; not wired in the default provider).

### Session-state enrichment

`session_state` and extended fields are supported in types and therapist handler; the default reporter uses heartbeat fields first. Additions should stay backward-compatible.

### Breakout and intervention coordination

The client should later accept therapist-initiated intervention messages such as breakout invites, but those messages are outside the currently implemented surface in this repo.

## 7. Deliberate non-claims

This repo should not claim that the following are already fully implemented here:

- auto-join call-link behavior,
- auto-screen-share,
- rich multi-rule / game-driven triage (only minimal direct + group rules today),
- orchestration-service forwarding.

**Partially / elsewhere in forks:** remote control / RustDesk flows, therapist dashboard correlation (therapist fork), client-side MiMo Redux for local monitor.

Those are either therapist-side features, future client work, or features only described in archived planning material.

## 8. Acceptance for the client repo

This contract is satisfied at the current stage if:

- the ingest endpoint accepts valid JSON with `clientSessionId`,
- invalid JSON fails cleanly,
- the payload is forwarded to the renderer as `mimo-ingest-metadata`,
- docs clearly distinguish current code from target MiMo behavior.

## 9. Next contract revision triggers

Update this file when any of the following land in `Signal-Desktop-client`:

- a real metadata reporter,
- Signal-native MiMo message transport,
- expanded metadata payload types,
- breakout handling,
- remote support or remote control flows.
