# Therapist build — implementation context

Living notes for MiMo / remote-therapy work on **Signal-Desktop-therapist**. Update this file when behavior or integration contracts change.

## Breakout: multi-party → direct 1:1 → rejoin

**Goal:** True RingRTC **direct** (`CallMode.Direct`) semantics for a private therapist–client call, then an explicit path back to the **same** GV2 group or **call-link** room.

**Constraints:**

- RingRTC allows **one** active call at a time on the client. Starting a direct call while a group call is active is blocked (`startOutgoingDirectCall` requires the previous call to have ended).
- Implementation uses **`hangUpThenStartCallingLobby`** / **`hangUpThenStartCallLinkLobbyByRoomId`** in `ts/state/ducks/calling.preload.ts`: `await hangUpActiveCall`, then `startCallingLobby` or `startCallLinkLobbyByRoomId`.

**UX (Therapist Console):**

1. In a **group or call-link** call, with a selected participant that has a **linked direct Signal conversation** (`selectedInterventionConversation`), Quick Actions shows **“1:1 session with …”**. Confirming leaves the multi-party call and opens the **direct** calling lobby (video).
2. **`SavedMultiPartyContext`** (`ts/types/TherapistBreakout.std.ts`) stores either `{ kind: 'conversation', conversationId, title }` (GV2) or `{ kind: 'callLink', roomId, title }` (adhoc) so the therapist can **rejoin** later.
3. A **banner** offers **“Rejoin multi-party session”** while that context is set (including after the 1:1 ends, until rejoin or manual return to the same room clears it).
4. **`TherapistBreakoutProvider.preload.tsx`** wraps the app (`App.preload.tsx`) and holds **one** shared breakout state for both code paths. **`SmartCallManager`** passes the same context into **`CallManager.dom.tsx`** → **`TherapistConsoleModal`** (active call), and **`SmartTherapistConsole`** consumes it when no call (optional hook). **`TherapistConsoleModal.dom.tsx`** renders the actions and banner.

**Client side:** When the therapist starts a breakout, the client receives a MiMo **`breakout_direct_invite`** message, saves the current multi-party room, leaves any active group/call-link call, lets the therapist’s incoming direct call ring on the device, and automatically rejoins the saved room after that 1:1 ends or is missed.

## Storybook

- `ts/components/CallManager.dom.stories.tsx`: **`TherapistConsoleOngoingGroupCall`** (therapist shell over a connected group call) and **`TherapistConsoleDirectCallWithRejoinBanner`** (1:1 call + saved multi-party context / rejoin banner). Actions log to Storybook for breakout/rejoin handlers.

## Install: QR linking uses Session Console chrome

During **AppViewType.Installer** / QR device linking, the UI is **`TherapistInstallLinkShell`** (`ts/components/TherapistInstallLinkShell.dom.tsx`): same Session Console header and sidebar as the main therapist modal, with **Devices** highlighted and the provisioning QR in the main column (`InstallScreenQrCodeNotScannedStep.dom.tsx`). The full **Therapist Console** modal is not mounted until the inbox loads.

After the phone completes linking and post-registration syncs finish, **`openInboxThenTherapistConsole`** in `ts/background.preload.ts` opens the inbox then **`showTherapistConsole`**, so the default landing is **Session Console** (not the stock Signal left-pane only).

## Related docs

- `docs/MIMO_ARCHITECTURE_CONTRACT.md` — metadata path and `clientSessionId` mapping.
- `mi_mo_remote_therapy_system_project_brief.md` — product timeline and milestones.
- Repository root `signal-cli/README.md` — optional **signal-cli** workflow (linked device without Signal Desktop); use when automation or headless linking is required instead of the Electron builds.
