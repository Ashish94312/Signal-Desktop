# Client Build Context

Living notes for MiMo work in `Signal-Desktop-client`.

This file is intentionally client-specific. The previous version was copied from the therapist repo and described therapist behaviors that do not belong to this checkout.

## What this repo is

This repo is the **client-side** Signal Desktop fork for MiMo.
Its intended runtime is the participant device, not the therapist-only operator build.

## Coverage snapshot (what is implemented vs not)

### Implemented in this checkout (MiMo / Session Console)

- **HTTP ingest (main process)**  
  - `app/mimo_ingest_http.main.ts` — `127.0.0.1`, default port `8765`, `POST /mimo-metadata`, `GET /mimo-metadata`  
  - `MIMO_INGEST_PORT` overrides the port; bind address remains loopback-only.

- **Metadata store**  
  - `app/mimo_metadata_store.main.ts` — latest snapshot per `clientSessionId`

- **IPC → renderer**  
  - `app/main.main.ts` — starts ingest server; forwards snapshots to the window (`mimo-ingest-metadata`)

- **Redux: `mimoSession`**  
  - `ts/state/ducks/mimoSession.preload.ts` — `ingestMetadata`; registered in `ts/state/reducer.preload.ts` and included in `ts/state/getInitialState.preload.ts`

- **Session Console (participant build)**  
  - View → **Session Console** (`app/menu.std.ts`, IPC `show-therapist-console`, `globalModals` / `TherapistConsoleModal`)  
  - Group-management row can be hidden for participant UX (`TherapistConsoleModal.dom.tsx` / `SHOW_GROUP_MANAGEMENT_IN_SESSION_CONSOLE`)

- **Calling: breakout / rejoin (same semantics as therapist fork)**  
  - `ts/state/ducks/calling.preload.ts` — `hangUpThenStartCallingLobby`, `hangUpThenStartCallLinkLobbyByRoomId`, `joinMultiPartyLobbyAfterReady`, extended `startCallingLobby` / call-link lobby  
  - `ts/state/smart/TherapistBreakoutProvider.preload.tsx` — saves multi-party context, `sendBreakoutDirectInvite` (`ts/services/mimoMessageSender.preload.ts`), rejoin handlers

- **Monitor / demo**  
  - `mimo_metadata_monitor.html` + `js/mimo_metadata_monitor.js`  
  - Menu: simulate / open metadata monitor where present (`app/menu.std.ts`)

### Not implemented (or only partial) — do not assume

- **Automatic** game/runtime heartbeat reporter (always-on client daemon separate from manual/demo ingest)  
- **Signal `DataMessage`** transport for all MiMo payloads end-to-end  
- **Local rule engine** and structured **alert severity** pipeline  
- **Remote control** approval and OS-level **input injection** to the participant machine  
- **Dedicated backend** session registry / alert router (orchestration service from the product brief)  
- **Fedora/ZeuronOS-only** enforcement in the Electron app (brief target OS vs this codebase)

If you add a capability above, update this section in the same PR.

## Current event contract

Minimum payload shape for ingest (see also `ts/types/MiMoMetadata.std.ts` / duck):

```ts
type MiMoMetadataIngestPayload = {
  clientSessionId: string;
  gameId?: string | null;
  heartbeatUnixMs?: number;
};
```

Renderer event name:

```text
mimo-ingest-metadata
```

## Environment and knobs

- `MIMO_INGEST_PORT` — overrides default `8765`
- bind address is fixed to `127.0.0.1`

## Repo hygiene (do not delete the app manifest)

If you run `git restore .` to recover from a bad working tree, you will **revert every tracked change**, including MiMo wiring in `app/main.main.ts`, and you can accidentally leave **`package.json`** deleted if that deletion was only partially fixed.

**Safer recovery when `pnpm install` fails with “No package.json”:** restore only what was removed, for example:

`git restore package.json pnpm-lock.yaml pnpm-workspace.yaml`

Then re-apply or cherry-pick your feature commits. Use `git restore .` only when you intend to discard **all** local edits to tracked files.

## Recommended implementation order from here

1. Real **client session reporter** (heartbeat) into ingest or Signal transport.  
2. **Signal-native MiMo messages** for cross-machine delivery when HTTP is not enough.  
3. Richer payload fields once the path is stable.  
4. **Rule engine + alert objects** aligned with `docs/MIMO_ARCHITECTURE_CONTRACT.md`.  
5. **Remote control** only after metadata and calls are proven.

## Documentation rules for this repo

- Document only files and behavior that exist in `Signal-Desktop-client`.  
- Label planned work as planned work.  
- Update this file when MiMo services, transport, or console behavior changes.

## Related docs

- `docs/MIMO_ARCHITECTURE_CONTRACT.md` — client-to-therapist payload and transport contract  
- `mi_mo_remote_therapy_system_project_brief.md` — product brief and acceptance checklist (therapist repo copy; see §12 for marked coverage)
