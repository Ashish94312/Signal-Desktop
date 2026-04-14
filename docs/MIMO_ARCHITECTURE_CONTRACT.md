# MiMo ↔ Signal Desktop (Therapist) — Architecture Contract

This document locks the **integration contract** between the MiMo client, the therapist build of Signal Desktop, and (later) an orchestration service. It is the reference for steps 1–2 of the MiMo rollout: metadata path + one live session loop.

## 1. Session model

| Concept                 | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Signal call**         | One RingRTC session: direct call, group call, or call-link (adhoc) room. Therapists monitor **participants inside this call**.                                                                                                                                                                                                                                                                                                                                                                                                   |
| **MiMo client session** | One logical MiMo device/user in a therapy shift. Identified by **`clientSessionId`** (opaque string, chosen by MiMo/orchestrator).                                                                                                                                                                                                                                                                                                                                                                                               |
| **Mapping**             | `clientSessionId` **must** be stable for the device for the duration of the shift. **Recommended:** set `clientSessionId` to the client’s **ACI** (`GroupCallRemoteParticipantType.aci`) or **Signal `serviceId`** so it matches RingRTC participants. The therapist UI links ingest rows and session tiles when `clientSessionId` equals that participant’s `aci` or `serviceId` (direct calls: peer `conversation.serviceId` / remote participant). Alternative: opaque id + orchestrator lookup (not wired in the shell yet). |
| **Therapist operator**  | The logged-in Signal user running the therapist build; joins the same call as clients.                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 2. Media path (unchanged)

- **Audio / video / screen share** use existing Signal / RingRTC flows (SFU for group/call-link).
- **Screen share** from the client is the primary way the therapist sees the MiMo UI; no separate capture protocol in this MVP slice.

## 3. Metadata path (MVP)

**Purpose:** heartbeats, game/module id, and later alert payloads — **out of band** from encoded media.

**Chosen transport for the vertical slice:**

1. **In-process / demo:** main window dispatches `mimo-ingest-metadata` with a JSON payload (View menu).
2. **Cross-app (client → therapist on same machine):** therapist main process listens on **`http://127.0.0.1:8765/mimo-metadata`** (override port with `MIMO_INGEST_PORT`). The **Signal-Desktop-client** build POSTs the same JSON on an interval while a call is active (`SmartMiMoSessionReporter`). Set **`MIMO_THERAPIST_INGEST_URL`** on the client if the therapist uses a different host/port.
3. **Signal-native path (client → therapist over WAN/LAN):** therapist renderer also intercepts MiMo-prefixed Signal **`DataMessage.body`** payloads in `background.preload.ts`, so heartbeats and alerts work even when localhost HTTP is unavailable.
4. **Next increment:** same payload from a **remote orchestrator** (WebSocket / HTTPS) that forwards into the therapist via this HTTP endpoint or IPC.

**Envelope (renderer):**

```typescript
type MiMoMetadataIngestPayload = {
  clientSessionId: string;
  gameId?: string | null;
  /** Client wall time when heartbeat was generated (ms since epoch). */
  heartbeatUnixMs?: number;
};
```

The therapist UI stores the latest snapshot **per `clientSessionId`** and shows it in the Therapist Console.

## 4. Out of scope for this contract revision

- Remote input injection (Fedora `xdotool` / Wayland tools).
- Full 30-tile thumbnail grid and `setGroupCallVideoRequest` tuning.
- Persistence of MiMo rows in SQL (optional later migration).

## 5. Acceptance for “step 2”

- [ ] Therapist can join a **call** with a client and see **media** as today.
- [ ] A **metadata ingest** updates the console (live **game id** + **heartbeat** display).
- [ ] **View → Simulate MiMo metadata** (or external send of the same event) proves the path without a second repo.

This file should be updated when the orchestrator or `clientSessionId` mapping strategy changes.
