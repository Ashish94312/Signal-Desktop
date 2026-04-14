# MiMo Remote Therapy System — Implementation Plan for Signal Desktop

## Context

The MiMo project brief (`mi_mo_remote_therapy_system_project_brief.md`) describes a remote therapy and support system that allows therapists to monitor 30 live client sessions, selectively interact via audio/video, remotely control client devices, and receive rule-based alerts. This plan maps every MiMo requirement to Signal Desktop's existing architecture, identifying what to reuse, what to extend, and what to build new — following Signal's proven patterns throughout.

---

## Architecture Strategy

```
CLIENT (MiMo Device / Fedora)          BACKEND (Orchestrator)          THERAPIST CONSOLE (New Window)
┌─────────────────────────┐         ┌──────────────────────┐         ┌──────────────────────────┐
│ Existing Signal App     │         │ WebSocket Server     │         │ New Electron Window      │
│ + mimoRuleEngine        │ ──WS──►│ + Session Registry   │◄──WS──│ + 30-tile Dashboard      │
│ + mimoSessionReporter   │         │ + Alert Router       │         │ + FocusedSession Panel   │
│ + mimoRemoteControl     │         │ + Heartbeat Monitor  │         │ + AlertPanel             │
│ + Screen auto-share     │         │ + Remote Input Relay │         │ + RemoteControlOverlay   │
└─────────────────────────┘         └──────────────────────┘         └──────────────────────────┘
         │                                                                      │
         └─────────────── RingRTC Group Call (SFU) ────────────────────────────┘
                          (Audio/Video/Screen Share)
```

**Key reuse**: RingRTC group calls as the media transport layer. Each MiMo session = a participant in a group call. The therapist joins the same call. SFU handles media routing. For 30-session monitoring, request low-res thumbnails for all + full resolution for focused session via `setGroupCallVideoRequest()`.

**Remote control**: WebSocket data channel through orchestrator (RingRTC doesn't expose WebRTC DataChannel). Therapist sends mouse/keyboard events → orchestrator relays → client injects via `xdotool` (X11) or `ydotool` (Wayland) on Fedora.

---

## Files to Create

### A. Therapist Console Window

| File | Purpose | Pattern From |
|------|---------|-------------|
| `therapistConsole.html` | HTML shell | `screenShare.html` |
| `ts/windows/therapistConsole/preload.preload.ts` | IPC bridge (contextBridge) | `ts/windows/screenShare/preload.preload.ts` |
| `ts/windows/therapistConsole/app.dom.tsx` | React entry point | `ts/windows/screenShare/app.dom.tsx` |

### B. Therapist Console Components

| File | Purpose |
|------|---------|
| `ts/components/therapistConsole/TherapistDashboard.dom.tsx` | Root: grid + focused panel + alert sidebar |
| `ts/components/therapistConsole/SessionGrid.dom.tsx` | 6x5 CSS Grid for 30 tiles |
| `ts/components/therapistConsole/SessionTile.dom.tsx` | Single tile: thumbnail, status badge, alert indicator, name |
| `ts/components/therapistConsole/SessionTileVideo.dom.tsx` | Low-FPS canvas renderer (2 FPS) |
| `ts/components/therapistConsole/FocusedSession.dom.tsx` | Full interaction: large video, audio/video controls, remote toggle |
| `ts/components/therapistConsole/AlertPanel.dom.tsx` | Sorted alert list by severity |
| `ts/components/therapistConsole/RemoteControlOverlay.dom.tsx` | Transparent overlay capturing mouse/keyboard for remote control |

### C. Redux State

| File | Purpose |
|------|---------|
| `ts/state/ducks/mimoSessions.preload.ts` | Duck: session registry, alerts, focused session, remote control state |
| `ts/state/selectors/mimoSessions.std.ts` | Selectors: `getSessions`, `getFocusedSession`, `getAlertsByPriority` |
| `ts/state/smart/TherapistDashboard.preload.tsx` | Smart container connecting Redux to dashboard |

**State shape:**
```typescript
type MiMoState = {
  sessions: Record<string, MiMoSession>;
  focusedSessionId: string | null;
  remoteControlActive: boolean;
  alerts: Record<string, MiMoAlert[]>;
};

type MiMoSession = {
  sessionId: string;
  clientDeviceId: string;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  currentGameId: string | null;
  gameProgress: number;
  lastHeartbeat: number;
  alertSeverity: 'green' | 'yellow' | 'red';
  videoThumbnailDemuxId: number;
  participantName: string;
};

type MiMoAlert = {
  alertId: string;
  sessionId: string;
  type: 'inactivity' | 'mismatch' | 'no_progress' | 'disconnected' | 'no_user';
  severity: 'green' | 'yellow' | 'red';
  message: string;
  timestamp: number;
  acknowledged: boolean;
};
```

### D. Client-Side Services

| File | Purpose |
|------|---------|
| `ts/services/mimoRuleEngine.preload.ts` | Rule engine: monitors game metadata, detects anomalies, emits alerts |
| `ts/services/mimoSessionReporter.preload.ts` | Heartbeat + metadata reporter to orchestrator |
| `ts/services/mimoRemoteControl.preload.ts` | Receives remote input commands, forwards to main process |

### E. Backend Orchestration

| File | Purpose |
|------|---------|
| `ts/services/mimoOrchestrator.main.ts` | Main-process WebSocket server: session registry, routing, heartbeat |
| `app/mimo_channel.main.ts` | IPC channel for MiMo (pattern from `app/sql_channel.main.ts`) |

### F. Shared Types

| File | Purpose |
|------|---------|
| `ts/types/MiMoSession.std.ts` | Session, Alert, Heartbeat, RemoteInputEvent types |
| `ts/types/MiMoRules.std.ts` | Rule definitions, thresholds, severity mappings |

### G. Database

| File | Purpose |
|------|---------|
| `ts/sql/migrations/1000-mimo-sessions.std.ts` | Tables: `mimo_sessions`, `mimo_alerts`, `mimo_session_history` |

---

## Files to Modify

| File | What to Change |
|------|---------------|
| [app/main.main.ts](app/main.main.ts) | Add `showTherapistConsole()` (pattern from `showScreenShareWindow` at ~L1250), add `therapistConsoleWindow` var, register MiMo IPC handlers |
| [rolldown.config.ts](rolldown.config.ts) | Add therapist console entries to `contextIsolated` and `contextIsolatedDom` maps (~L58-75) |
| [ts/state/reducer.preload.ts](ts/state/reducer.preload.ts) | Import and register `mimoSessions` reducer in `combineReducers` (~L44) |
| [ts/services/calling.preload.ts](ts/services/calling.preload.ts) | Add `joinMiMoGroupCall()`, `setThumbnailModeVideoRequests()` methods to `CallingClass` |
| [ts/state/ducks/calling.preload.ts](ts/state/ducks/calling.preload.ts) | Add `setLowFpsVideoRequest` action, extend `CallingStateType` with `mimoMode` flag |
| [ts/calling/VideoSupport.preload.ts](ts/calling/VideoSupport.preload.ts) | Add `LowFpsCanvasVideoRenderer` class (renders at 2 FPS via frame skipping) |
| [ts/types/Calling.std.ts](ts/types/Calling.std.ts) | Add `MiMoSessionCallType`, `ThumbnailVideoRequest` types |
| [app/menu.std.ts](app/menu.std.ts) | Add "MiMo Therapist Console" menu item |
| [ts/background.preload.ts](ts/background.preload.ts) | Initialize MiMo services (rule engine, session reporter) on startup |

---

## 20-Day Execution Plan

### WEEK 1 (Days 1–5): Core Architecture + Communication

**Day 1 — Scaffold + Types**
- Create all type files: `ts/types/MiMoSession.std.ts`, `ts/types/MiMoRules.std.ts`
- Create `therapistConsole.html` + preload + app.dom.tsx (empty shells)
- Add build entries to `rolldown.config.ts`
- Add `showTherapistConsole()` to `app/main.main.ts`
- Add menu item to `app/menu.std.ts`

**Day 2 — Client app shell + permissions**
- Create stub services: `mimoSessionReporter.preload.ts`, `mimoRuleEngine.preload.ts`
- Verify Fedora camera/mic/screen capture via existing `DesktopCapturer`
- Add MiMo constants to `ts/calling/constants.std.ts`

**Day 3 — 1:1 audio/video prototype**
- Add `joinMiMoGroupCall()` to `CallingClass` in `ts/services/calling.preload.ts`
- Create dedicated call link for MiMo sessions (reuse `CallLinkRootKey` from RingRTC)
- Test therapist joining same group call as client

**Day 4 — Screen sharing integration**
- Client auto-shares screen on MiMo session start (reuse `setPresenting()` flow)
- Therapist receives screen via `getGroupCallVideoFrameSource()`
- Verify end-to-end: client screen visible on therapist side

**Day 5 — Remote control prototype**
- Create `ts/services/mimoRemoteControl.preload.ts`
- Create `app/mimo_channel.main.ts` with `xdotool` integration
- Create `RemoteControlOverlay.dom.tsx` (captures mouse/keyboard, normalizes coords)
- Test basic mouse movement: therapist moves mouse → client cursor moves

**Week 1 Deliverable**: 1 client ↔ 1 therapist, audio/video works, screen share works, remote input prototype

---

### WEEK 2 (Days 6–10): Multi-Session Dashboard

**Day 6 — Backend session manager**
- Create `ts/services/mimoOrchestrator.main.ts` (WebSocket server in main process)
- Implement session registry: register, heartbeat, disconnect detection
- Create `ts/sql/migrations/1000-mimo-sessions.std.ts`

**Day 7 — Dashboard grid UI**
- Create `TherapistDashboard.dom.tsx`, `SessionGrid.dom.tsx`, `SessionTile.dom.tsx`
- CSS Grid: 6 columns × 5 rows, responsive tile sizing
- Status indicators: connection dot, game label, participant name

**Day 8 — Connect sessions to Redux**
- Create `ts/state/ducks/mimoSessions.preload.ts`
- Create `ts/state/selectors/mimoSessions.std.ts`
- Register in `ts/state/reducer.preload.ts`
- Wire IPC: orchestrator pushes updates → therapist console Redux store

**Day 9 — Low-FPS thumbnail mode**
- Add `LowFpsCanvasVideoRenderer` to `ts/calling/VideoSupport.preload.ts`
  - Frame-skip in `requestAnimationFrame`: render every 15th frame (~2 FPS)
- Create `SessionTileVideo.dom.tsx` using low-FPS renderer
- Add `setThumbnailModeVideoRequests()` to CallingClass: 160×120 @ 2 FPS per tile

**Day 10 — Scalability testing**
- Simulate 10–15 concurrent sessions
- Profile: CPU, memory, network, canvas draw overhead
- Optimize: pool OffscreenCanvas, batch Redux updates, destroy off-screen renderers

**Week 2 Deliverable**: Dashboard shows multiple sessions, tile grid works, focus mode works, first scalability baseline

---

### WEEK 3 (Days 11–15): Active Intervention + Remote Support

**Day 11 — Per-session audio**
- Therapist mic routes to focused session only
- Mute all non-focused participants on therapist side
- Add mute/unmute controls in `FocusedSession.dom.tsx`

**Day 12 — Therapist video to selected session**
- Enable therapist camera → focused session only
- One-to-one guidance mode
- Create `FocusedSession.dom.tsx` with full A/V controls

**Day 13 — Remote control hardening**
- Rate-limit xdotool calls (max 60/sec for mouse, 30/sec for keyboard)
- Access gating: client approval dialog before remote control starts
- Visual indicator on client: "Remote control active" banner
- Wayland detection: use `ydotool` if `$XDG_SESSION_TYPE == wayland`

**Day 14 — Focus/unfocus transitions**
- Click tile → focused mode: video upgrades to 720p @ 30 FPS
- Click "Back" → grid mode: video downgrades to 160×120 @ 2 FPS
- Smooth Redux state transitions, UI animations

**Day 15 — End-to-end remote support test**
- Full scenario: identify issue → select session → talk → view → control → resolve
- Fix timing/state transition bugs
- Polish UI interactions

**Week 3 Deliverable**: Therapist can monitor 30, intervene in 1, remote control works reliably

---

### WEEK 4 (Days 16–20): Triage Logic + Alerts + Integration

**Day 16 — Define alert rules**
- Implement rule configs in `ts/types/MiMoRules.std.ts`:
  - `InactivityRule`: no input for 30s → yellow, 60s → red
  - `NoProgressRule`: progress unchanged 45s → yellow, 90s → red
  - `MismatchRule`: expected vs actual game state → red
  - `DisconnectedRule`: no heartbeat 15s → red

**Day 17 — Client-side rule engine**
- Implement `ts/services/mimoRuleEngine.preload.ts`
- Game metadata ingestion via local IPC (Unix socket or stdin/stdout from game SDK)
- Alert emission: `{ alertId, sessionId, type, severity, message, timestamp }`

**Day 18 — Alert visualization**
- Create `AlertPanel.dom.tsx`: sorted list by severity
- Color-code `SessionTile` borders: green (#22c55e) / yellow (#eab308) / red (#ef4444)
- Alert badge counts on tiles

**Day 19 — Triage prioritization**
- Red-alert sessions auto-sort to top of grid
- Yellow after red, green at bottom
- Alert acknowledgment flow (click to dismiss)
- Optional: alert sound notification

**Day 20 — Full integration + MVP review**
- End-to-end: game metadata → rule engine → alert → orchestrator → dashboard → intervention
- Fix final integration issues
- Document known limitations
- Prepare demo scenario

**Week 4 Deliverable**: Triage system works, alerts reach console, end-to-end intervention loop complete

---

## Key Integration Points (Existing Signal Code)

| What | Where | How to Reuse |
|------|-------|-------------|
| Group call join | `CallingClass.#joinGroupCall()` ~L1930 in `ts/services/calling.preload.ts` | Extend for MiMo sessions |
| Video quality control | `CallingClass.setGroupCallVideoRequest()` ~L1997 | Set low-res for thumbnails, high-res for focused |
| Video frame source | `CallingClass.getGroupCallVideoFrameSource()` | Feed into `CanvasVideoRenderer` per tile |
| Screen share | `CallingClass.setPresenting()` ~L2686 | Auto-enable on client side |
| Canvas rendering | `CanvasVideoRenderer` in `ts/calling/VideoSupport.preload.ts` | Extend with frame-skip for `LowFpsCanvasVideoRenderer` |
| Window creation | `handleCommonWindowEvents()` ~L530 in `app/main.main.ts` | Follow for therapist console window |
| IPC pattern | `app/sql_channel.main.ts` L23-102 | Follow for `app/mimo_channel.main.ts` |
| Redux pattern | `ts/state/ducks/calling.preload.ts` (state L257, actions L3065) | Follow for `mimoSessions` duck |
| Preload bridge | `ts/windows/screenShare/preload.preload.ts` | Follow for therapist console preload |

---

## Scalability Notes (30 Sessions)

- **Bandwidth**: 30 tiles × 160×120 @ 2 FPS ≈ 1–2 Mbps + 1 focused 720p30 ≈ 2–3 Mbps = **~4–5 Mbps total**
- **CPU**: 30 canvas draws at 2 FPS = 60 draws/sec (lightweight)
- **Memory**: Pool `OffscreenCanvas` instances; destroy renderers for off-screen tiles
- **Redux**: Batch `updateMultipleSessions` action to avoid 30 separate dispatches

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| RingRTC no per-participant audio routing | Mute all except focused on therapist side |
| xdotool doesn't work on Wayland | Detect `$XDG_SESSION_TYPE`, use `ydotool` for Wayland |
| 30 canvases cause memory pressure | Pool OffscreenCanvas, destroy off-screen renderers |
| WebSocket reliability for remote control | Message queue with retry, tolerate 100ms latency |
| Game metadata format varies | Define minimal SDK: `{ gameId, progress, expectedAction, timestamp }` |

---

## Verification Plan

1. **Unit tests**: Each new service (`mimoRuleEngine`, `mimoOrchestrator`, `mimoRemoteControl`) gets unit tests
2. **Integration test**: Full loop — client connects → metadata sent → alert generated → appears on dashboard → therapist focuses → audio/video/control works
3. **Scalability test**: Simulate 30 concurrent sessions, measure CPU/memory/bandwidth
4. **Manual test**: Run on Fedora, verify xdotool/ydotool works, verify camera/mic permissions
5. **Build verification**: `npm run build` succeeds with all new entries in rolldown.config.ts
