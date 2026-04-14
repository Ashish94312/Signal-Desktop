# MiMo Remote Therapy & Support System (Fedora / ZeuronOS)  
## Detailed Project Brief, Requirements, 20-Day Execution Plan, and Flowchart

---

## 1. Project Overview

### 1.1 Project Goal
  Build a **two-part remote therapy and support system** for **MiMo running on Fedora / ZeuronOS only**. The system should enable therapists or internal operators to:

  - monitor up to **30 live client sessions in parallel** for the MVP,
  - selectively interact with any session using **audio/video**,
  - remotely access and control the client system for **support, debugging, and intervention**,
- receive **basic AI/rule-based alerts** when the live therapy/game session deviates from the expected activity.

This is a **20 working day build plan** with remaining days in the month reserved for:
- integration fixes,
- testing,
- performance tuning,
- bug fixing,
- demo preparation,
- pending tasks.

---

## 2. Product Scope

### 2.1 In Scope

#### A. Client-Side MiMo Application
Runs on MiMo device (Fedora / ZeuronOS).

Core functions:
- secure audio/video communication,
- screen sharing,
- microphone control,
- camera control,
- speaker mute/unmute control,
- remote keyboard and mouse control from therapist side,
- session/game metadata reporting,
- lightweight AI/rule-based monitoring,
- alert generation and reporting.

#### B. Therapist/Internal Control Console
Runs at office / therapist side.

Core functions:
- display **30 concurrent sessions** in a tiled dashboard,
- allow selective session focus,
- allow therapist to speak to one session (via selected 1:1 intervention call),
- allow therapist to send video to one session (via selected 1:1 intervention call),
- allow therapist to remotely access a selected client system,
- show live triage alerts from sessions,
- prioritize intervention through alert highlighting.

#### C. Triage / AI Layer (MVP)
The first version will be **rule-based and heuristic-based**, not a full trained AI system.

It should:
- know which game/session is running,
- know expected user action at a basic level,
- detect inactivity or mismatch,
- flag deviations,
- notify therapist console.

---

### 2.2 Out of Scope for MVP
- multi-OS support,
- production-grade 100+ session architecture,
- advanced ML model training,
- full compliance/security certification,
- billing/admin/reporting modules,
- advanced analytics and historical dashboards.

---

## 3. Success Definition for MVP

The MVP is considered successful if all of the following are achieved:

1. A client MiMo device can:
   - start a secure session,
   - share screen,
   - enable audio/video,
   - allow remote support control.

2. The therapist console can:
   - display **30 session tiles**,
   - show session state and alerts,
   - allow selection of one session for active intervention.

3. The therapist/operator can for a selected session:
   - speak to the participant,
   - optionally send their own video,
   - remotely control the device using mouse/keyboard.

4. The client-side intelligence layer can:
   - identify the active game/session,
   - compare expected vs observed behavior at a basic level,
   - raise a usable flag.

5. End-to-end triage loop works:
   - session runs,
   - issue detected,
   - alert appears,
   - therapist intervenes.

---

## 4. Product Architecture

### 4.1 High-Level Architecture
The system should follow this operating model:

**Client detects → Backend routes → Therapist monitors → Therapist intervenes**

---

### 4.2 Main Components

#### Component 1: Client App (MiMo Device)
Responsible for:
- audio/video session,
- permissions,
- screen sharing,
- local state monitoring,
- alert generation,
- remote access receiving.

#### Component 2: Session / Signaling / Orchestration Layer
Responsible for:
- connection setup,
- session IDs,
- therapist-client mapping,
- metadata routing,
- alert/event forwarding,
- session registry.

#### Component 3: Therapist Console
Responsible for:
- multi-session display,
- alert visualization,
- intervention controls,
- session selection,
- remote support entry.

#### Component 4: Rule Engine / Triage Layer
Responsible for:
- understanding expected behavior,
- detecting deviation,
- prioritizing alerts.

---

## 5. Key Functional Requirements

## 5.1 Client Application Requirements

### 5.1.1 Communication
- Must support secure therapist-client communication.
- Must support camera on/off.
- Must support microphone on/off.
- Must support speaker mute/unmute.
- Must support screen sharing.
- Therapist should be able to view the client display.

### 5.1.2 Remote Support / Device Control
- Therapist should be able to request remote access.
- Once approved/available, therapist should be able to:
  - move mouse,
  - click,
  - use keyboard,
  - interact with system UI,
  - support debugging,
  - install or configure missing elements if permitted.

### 5.1.3 Session Awareness
Client app should report:
- current session status,
- device online/offline state,
- current game/module running,
- expected activity type,
- activity completion/progress metadata.

### 5.1.4 Triage Engine (MVP)
Should support basic checks such as:
- no user detected,
- user inactive for threshold time,
- expected motion not happening,
- repeated failure / no game progress,
- mismatch between expected action and observed action,
- session/device disconnected.

### 5.1.5 Event Transmission
Client app should send:
- session heartbeat,
- alert type,
- alert severity,
- timestamps,
- active game identifier,
- optional snapshots/metadata if needed.

---

## 5.2 Therapist Console Requirements

### 5.2.1 Session Monitoring Grid
- Must display **30 sessions simultaneously** in MVP mode.
- Each tile should show at minimum:
  - session ID / participant name,
  - connection status,
  - alert status,
  - current game/module,
  - video thumbnail or screen preview.

### 5.2.2 Active Intervention Controls
For selected session, therapist should be able to:
- talk to the participant,
- enable therapist video for that session,
- mute/unmute audio streams if supported,
- enter remote control mode,
- bring selected session into focus mode.

### 5.2.3 Alert / Triage Display
- Alerts should be shown visually.
- Minimum triage states:
  - Green = normal,
  - Yellow = warning,
  - Red = intervention needed.
- Console should highlight sessions that require therapist action.

### 5.2.4 Multi-Session Scalability Behavior
To support 30 sessions, the system should:
- avoid 30 full-resolution live streams by default,
- use low-FPS / low-resolution thumbnails in grid mode,
- upgrade selected session to active high-quality mode,
- highlight flagged sessions first.

---

## 5.3 Backend / Service Requirements
- Session registry management
- Signaling / connection establishment
- Event and alert forwarding
- Session metadata routing
- Basic logging
- Device/therapist session mapping
- Reconnect support for dropped sessions

---

## 6. Non-Functional Requirements

### 6.1 Platform Constraint
- Target OS: **Fedora / ZeuronOS only**
- No Windows/macOS/Linux-general support required for MVP

### 6.2 Performance
- Dashboard should handle **30 concurrent visible sessions**
- One active intervention session should remain usable while others remain visible
- Grid mode can use reduced FPS/quality

### 6.3 Reliability
- Session status should recover from temporary disconnects where possible
- Alerts should not silently disappear
- Heartbeat/online status should be visible

### 6.4 Security
- Secure communication required
- Remote control must be limited to authenticated therapist/operator sessions
- Permission boundaries must be explicit

### 6.5 UX
- Therapist should identify problems quickly
- Alert priority should be visually obvious
- Switching from passive monitoring to active control must be fast

---

## 7. Technical Notes / Recommended Approach

### 7.1 Communication Layer
Use a secure real-time communication approach suitable for:
- video,
- audio,
- screen sharing,
- metadata/events.

### 7.2 Remote Control Layer
Since environment is Fedora-only, implementation can rely on Fedora-compatible mechanisms for:
- screen capture,
- input injection,
- remote session control.

### 7.3 Triage Logic Strategy
For this first version, use:
- rules,
- thresholds,
- session state checks,
- expected-vs-observed logic.

Do **not** overcomplicate with full AI models in MVP.

### 7.4 Scaling Strategy
To reach 30 concurrent sessions:
- show passive low-quality previews for all sessions,
- activate high-quality stream only for selected session,
- use event-driven escalation rather than continuous full-resolution analysis.

---

## 8. Risks and Constraints

### 8.1 Key Risks
1. **30 sessions in full quality is not realistic for MVP**  
   Must rely on grid preview mode and selective focus.

2. **Remote control can be technically sensitive depending on display/input stack**  
   Fedora-only reduces complexity but does not eliminate implementation risk.

3. **Trying to build advanced AI too early will delay the project**  
   MVP must use rule-based triage.

4. **Integration risk between both apps**  
   Client app and therapist console must be built in sync from week 1 onward.

---

## 9. 20-Day Execution Plan

This plan assumes:
- 5 working days per week
- 4 working weeks
- remaining days in month reserved for testing, fixes, and pending tasks

### Day-wise coverage (Signal Desktop forks)

Markers reflect work landed in **`Signal-Desktop-therapist`** and **`Signal-Desktop-client`** (embedded Session Console, RingRTC calls, MiMo HTTP ingest → renderer, breakout/rejoin). They do **not** mean every bullet is done in a separate backend service or Fedora-only deliverable.

| Marker | Meaning |
|--------|--------|
| `[x]` | Largely covered for the fork integration described in §12 |
| `[~]` | Partially covered, or covered in-app but not as a standalone service / full validation |
| `[ ]` | Not covered in these forks (still open) |

---

## WEEK 1 (Days 1–5)
### Milestone: Core architecture, communication base, system permissions

### Objectives
- lock architecture,
- create both application skeletons,
- establish core communication primitives,
- validate Fedora-specific permissions.

### Day-wise Tasks

#### Day 1
- [~] final architecture definition *(evolved around Signal + embedded console; separate orchestrator not built)*
- [~] define modules and interfaces *(MiMo types, ingest, Redux `mimoSession`, calling extensions)*
- [~] create code repositories / structure for:
  - [x] client app *(`Signal-Desktop-client` fork)*
  - [x] therapist console *(`Signal-Desktop-therapist` fork; Session Console in-app)*
  - [ ] backend/session services *(no standalone session service repo in this effort)*
- [~] define session/event schema *(MiMo protocol / metadata ingest; not full orchestrator schema)*

#### Day 2
- [x] implement basic client app shell
- [x] implement therapist console shell *(Session Console UX embedded in therapist build; participant variant on client fork)*
- [x] set up local environment and build pipeline
- [x] verify access to:
  - [x] camera
  - [x] microphone
  - [x] screen capture
  - [x] audio output controls

#### Day 3
- [x] implement secure 1:1 audio/video session prototype
- [x] validate client ↔ therapist connection flow *(via Signal / RingRTC)*

#### Day 4
- [x] implement screen sharing from client to therapist
- [x] verify therapist can view client display *(in-call / group-call surfaces in Session Console)*

#### Day 5
- [~] build first remote control prototype *(RustDesk-assisted request/credential flow integrated; native in-app OS input injection not implemented)*
- [~] test basic keyboard/mouse control path *(manual RustDesk path available; full validation matrix pending)*
- [~] review week 1 blockers *(ongoing; remote control remains partially covered)*

### Week 1 Deliverable
- [x] one client can connect to one therapist
- [x] audio/video works
- [x] screen sharing works
- [~] remote input prototype exists *(RustDesk-assisted path; not native in-app injection)*

---

## WEEK 2 (Days 6–10)
### Milestone: Multi-session backbone and 30-session dashboard foundation

### Objectives
- build the session orchestration layer,
- create therapist monitoring grid,
- start scaling from 1 session to many sessions.

### Day-wise Tasks

#### Day 6
- [ ] implement backend session manager *(no separate orchestration service; Signal + local HTTP ingest only)*
- [~] create unique session registration logic *(conversation/call-link model; not generic session registry)*
- [~] build client heartbeat and status model *(metadata payload + `mimoSession`; no always-on game reporter)*

#### Day 7
- [x] create therapist dashboard tile/grid layout *(Session Console / video tile grid)*
- [~] support placeholders for 30 session tiles *(grid supports many tiles; **30** not validated)*
- [x] add status indicators in UI *(participant tiles + alert severity color cues in grid/stage/cards)*

#### Day 8
- [~] connect real sessions into dashboard tiles *(group/call-link participants; not 30 independent orchestrated sessions)*
- [~] show:
  - [~] session identity,
  - [~] online/offline state,
  - [~] current module/game *(when metadata ingested)*,
  - [~] basic preview.

#### Day 9
- [x] optimize grid behavior for low-resource monitoring *(mode-driven RingRTC video request profiles for balanced / low-FPS / thumbnail-only monitoring)*
- [x] implement low-FPS or thumbnail streaming mode *(implemented via therapist Monitoring Quality controls + framerate-aware video requests)*
- [x] enable click-to-focus interaction *(focus mode / spotlight in Session Console)*

#### Day 10
- [ ] run multi-session simulation test *(not run to brief’s 10–15 / bottleneck spec)*
- [ ] target 10–15 reliable sessions first
- [ ] identify CPU/network bottlenecks
- [~] plan fixes required to reach 30-view target *(still applicable; not executed as a formal test pass)*

### Week 2 Deliverable
- [x] therapist dashboard exists
- [~] multiple sessions visible in one console *(within a group/call-link; not 30 validated)*
- [x] focus mode works
- [ ] first scalability baseline established *(no measured baseline to 30)*

---

## WEEK 3 (Days 11–15)
### Milestone: Active therapist intervention and remote support workflow

### Objectives
- make intervention practical,
- complete remote support flow,
- enable therapist to operate inside a selected session.

### Day-wise Tasks

#### Day 11
- [x] implement per-session therapist audio intervention *(intervention / push-to-talk paths in Session Console)*
- [x] allow therapist to speak to selected client
- [x] add mute/unmute controls where supported *(where RingRTC/UI allows)*

#### Day 12
- [x] implement therapist video injection to selected session *(intervention mode / toggle video to session)*
- [x] verify one-to-one guidance mode *(direct call + 1:1 intervention UX; breakout path on both forks)*

#### Day 13
- [~] stabilize remote mouse/keyboard control *(RustDesk-assisted path present; hardening/extended validation pending)*
- [~] add basic access gating / confirmation flow *(request/approve flow for remote access messages present; not enterprise-grade policy gating)*
- [~] test therapist-side remote support path *(basic request/open/access lifecycle exercised; full regression matrix pending)*

#### Day 14
- [~] integrate active selection model:
  - [~] passive 30-session monitoring *(multi-tile passive view in call; **30** not validated)*
  - [x] active control of one chosen session *(focus mode, breakout to 1:1, rejoin)*
- [~] improve UI state transitions *(ongoing polish)*

#### Day 15
- [~] complete remote support scenario:
  - [~] identify issue *(metadata/activity panel only)*
  - [x] select session
  - [x] talk
  - [x] view
  - [~] control *(via RustDesk-assisted remote access)*
  - [~] troubleshoot *(remote support path exists; deeper validation pending)*

### Week 3 Deliverable
- [~] therapist can monitor many sessions *(within shared call / console; not 30 orchestrated)*
- [x] therapist can intervene in selected session
- [~] therapist can remotely control a chosen client device *(RustDesk-assisted remote access available; native in-app injection not implemented)*

---

## WEEK 4 (Days 16–20)
### Milestone: Triage logic, alerts, and end-to-end operational loop

### Objectives
- implement first-level intelligence layer,
- create alerting flow,
- complete end-to-end triage workflow.

### Day-wise Tasks

#### Day 16
- [x] define first-level alert rules *(implemented in client preload rule engine with timed thresholds + mismatch/connectivity checks)*
- examples:
  - [x] no motion,
  - [x] inactivity,
  - [ ] repeated failed attempts,
  - [x] no progress,
  - [x] wrong expected action zone,
  - [x] session disconnected. *(offline + hidden-window connectivity rule cues)*

#### Day 17
- [x] implement client-side rule engine
- [x] connect game/session metadata to rule engine *(game/session/context/progress signals feed rule evaluation)*
- [ ] keep game integration thin by using a small game-side SDK for structured event emission over local IPC into MiMo
- [x] emit alert objects with severity

#### Day 18
- [x] build therapist-side alert visualization *(Activity Monitor + session alerts + severity triage cues)*
- [x] color-code session tiles
- [x] add alert summary panel if possible *(Session Alerts panel + per-session cues)*

#### Day 19
- [ ] implement triage prioritization
- [ ] flagged sessions move to top / become highlighted
- [~] improve therapist response flow *(intervention + breakout; not alert-driven)*

#### Day 20
- [~] integrate full workflow:
  - [x] active game metadata *(when ingested)*,
  - [x] client-side rule check,
  - [x] alert generation,
  - [x] therapist dashboard display,
  - [x] intervention action.
- [~] prepare MVP completion review *(docs / §12 checklist; formal review out of band)*

### Week 4 Deliverable
- [~] usable triage system exists *(rule-based triage shipped; prioritization/re-ordering remains open)*
- [x] alerts reach therapist console *(client rule engine -> ingest -> relay -> therapist rendering path)*
- [~] end-to-end intervention loop works *(call + console + partial metadata; **not** full brief loop)*

### At-a-glance (days 1–20)

| Day | Overall | Day | Overall |
|-----|---------|-----|---------|
| 1 | [~] | 11 | [x] |
| 2 | [x] | 12 | [x] |
| 3 | [x] | 13 | [ ] |
| 4 | [x] | 14 | [~] |
| 5 | [ ] | 15 | [~] |
| 6 | [~] | 16 | [~] |
| 7 | [~] | 17 | [~] |
| 8 | [~] | 18 | [x] |
| 9 | [~] | 19 | [ ] |
| 10 | [ ] | 20 | [~] |

---

## 10. Remaining Month Buffer Usage

The remaining days in the month should be reserved for:
- unresolved integration tasks,
- bug fixing,
- session stability improvement,
- dashboard performance tuning,
- load testing toward 30 concurrent sessions,
- packaging and deployment,
- documentation,
- demo preparation.

---

## 11. Deliverables Expected from the Developer

By the end of the month, the developer should provide:

1. working client application MVP
2. working therapist console MVP
3. session orchestration/backend services
4. remote support functionality
5. first-level triage/alert logic
6. architecture note/documentation
7. setup instructions
8. known limitations list
9. test/demo scenario
10. next-phase recommendations

---

## 12. Suggested Acceptance Checklist

Coverage notes below reflect integration work in the **Signal-Desktop-therapist** and **Signal-Desktop-client** forks (Session Console embedded in the app, RingRTC calling, MiMo HTTP ingest → renderer, breakout/rejoin). They do **not** imply a separate production orchestrator service or Fedora-only certification.

### Functional Acceptance
- [x] client app starts and connects successfully *(Signal Desktop fork; staging/standalone as usual)*
- [x] audio/video session works *(base Signal + calls)*
- [x] screen sharing works *(base Signal)*
- [x] therapist can see session in dashboard *(participants / session UI in Session Console while in a call)*
- [x] dashboard can show 30 session tiles *(multi-tile grid UI in Session Console; **30 concurrent sessions not load-tested** for MVP)*
- [x] therapist can focus one session *(focus mode / spotlight in Session Console for group or adhoc)*
- [x] therapist can talk to selected session *(implemented via selected 1:1 intervention call action from therapist console)*
- [x] therapist can send video to selected session *(implemented via selected 1:1 intervention call action from therapist console)*
- [x] therapist can leave multi-party call and start separate direct 1:1 with saved rejoin context *(breakout + `TherapistBreakoutProvider`; also wired on client fork)*
- [~] therapist can remotely control selected client *(RustDesk-assisted remote access flow available; native mouse/keyboard injection to client OS not implemented in-app)*
- [x] client-side rules generate alerts *(rule engine emits inactivity/no_motion/no_progress/mismatch/disconnected + healthy green state)*
- [x] alerts are visible in therapist console *(Activity Monitor + Session Alerts + severity color cues in tiles/stages/cards)*

### Operational Acceptance
- [x] both applications work together end-to-end *(partial: Signal calls + Session Console + MiMo ingest path + breakout; **no** standalone session-orchestrator product)*
- [ ] 30-session view is practically usable for MVP *(layout exists; sustained CPU/network validation for 30 not done)*
- [x] flagged sessions are easy to identify *(severity color coding across session tiles, direct/spotlight stages, and session cards)*
- [x] selected-session intervention is stable enough for demo/pilot *(intervention UX + breakout/rejoin in fork; **verify on target hardware** before pilot)*

---

## 13. Flowchart

```text
+------------------+
|  Client starts   |
|  MiMo session    |
+---------+--------+
          |
          v
+------------------+
|  Session setup   |
|  audio/video     |
|  screen share    |
+---------+--------+
          |
          v
+-----------------------------+
| Client sends session data   |
| - game/module ID            |
| - heartbeat                 |
| - activity metadata         |
+--------------+--------------+
               |
               v
+-----------------------------+
| Client-side rule engine     |
| checks expected vs actual   |
+---------+-------------------+
          |
      +---+-------------------+
      |                       |
      v                       v
+-------------+       +----------------+
| No issue    |       | Issue detected |
| normal flow |       | alert created  |
+------+------+       +--------+-------+
       |                       |
       v                       v
+--------------------------------------+
| Backend / session orchestrator        |
| routes status + alerts to console     |
+-------------------+------------------+
                    |
                    v
+--------------------------------------+
| Therapist dashboard                  |
| - 30 session grid                    |
| - status / preview                   |
| - alert color coding                 |
+-------------------+------------------+
                    |
            +-------+--------+
            | Therapist acts? |
            +---+---------+---+
                |         |
               No        Yes
                |         |
                v         v
       +----------------+  +--------------------------+
       | Continue       |  | Select session           |
       | monitoring     |  | talk / video / control   |
       +----------------+  +------------+-------------+
                                         |
                                         v
                             +--------------------------+
                             | Remote intervention /    |
                             | support / debugging      |
                             +--------------------------+
```

---

## 14. Final Guidance to the Developer

This project should be approached as:

**“Build a Fedora-native remote therapy operating layer for MiMo, not just a video call app.”**

The priority order should be:
1. stable end-to-end workflow,
2. therapist visibility across 30 sessions,
3. selectable intervention,
4. reliable remote support,
5. basic triage intelligence.

Avoid overengineering the AI in month 1. The real goal of this phase is to prove that the complete remote therapy support loop is workable in a controlled MiMo/Fedora environment.
