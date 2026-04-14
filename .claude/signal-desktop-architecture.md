# Signal Desktop — Architectural Flowchart

## High-Level Architecture (7 Layers)

```
╔══════════════════════════════════════════════════════════════════════════╗
║                         ELECTRON MAIN PROCESS                          ║
║                    app/main.main.ts (lines 142-2542)                   ║
║                                                                        ║
║  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────────────┐  ║
║  │  App Startup │→ │ createWindow()  │→ │  BrowserWindow (main UI) │  ║
║  │  (line 54)   │  │  (line 675)     │  │  preload: wrapper.js     │  ║
║  └──────────────┘  └─────────────────┘  └──────────────────────────┘  ║
║                                                                        ║
║  IPC Handlers Registered:                                              ║
║  ├── sql_channel.main.ts    → sql-channel:read / sql-channel:write     ║
║  ├── attachment_channel.main.ts → file streaming (encrypted)           ║
║  ├── settingsChannel.main.ts   → settings:get:* / settings:set:*      ║
║  └── powerChannel.main.ts      → suspend / resume / lock-screen       ║
║                                                                        ║
║  Services in Main:                                                     ║
║  ├── SystemTrayService.main.ts                                         ║
║  ├── OptionalResourceService.main.ts                                   ║
║  └── Auto-updater, crash reporter, menus                               ║
╚═══════════════════════════╦════════════════════════════════════════════╝
                            ║  IPC (ipcMain ↔ ipcRenderer)
╔═══════════════════════════╩════════════════════════════════════════════╗
║                    RENDERER / PRELOAD LAYER                            ║
║                ts/windows/main/preload.preload.ts                      ║
║                                                                        ║
║  Initialization Phases (sequential):                                   ║
║  Phase 0 → phase0-devtools.node.ts       (DevTools, Node context)      ║
║  Phase 1 → phase1-ipc.preload.ts         (window.IPC, 50+ methods)    ║
║  Phase 2 → phase2-dependencies.preload.ts (load dependencies)         ║
║  Phase 3 → phase3-post-signal.preload.ts  (Signal-specific setup)     ║
║  Phase 4 → phase4-test.preload.ts         (test utilities)            ║
╚═══════════════════════════╦════════════════════════════════════════════╝
                            ║
╔═══════════════════════════╩════════════════════════════════════════════╗
║                   BACKGROUND SERVICE (background.html)                 ║
║                   ts/background.preload.ts (127 KB)                    ║
║                                                                        ║
║  Startup Sequence:                                                     ║
║  1. MessageReceiver setup (WebSocket connection to Signal servers)      ║
║  2. Service initialization (54 services)                               ║
║  3. Redux store creation                                               ║
║  4. Job queue initialization (26 queues)                               ║
║  5. Window ready signal                                                ║
╚═══════════════════════════╦════════════════════════════════════════════╝
                            ║
      ┌─────────────────────┼──────────────────────────┐
      ↓                     ↓                          ↓
╔═══════════════╗  ╔════════════════════╗  ╔══════════════════════╗
║  STATE LAYER  ║  ║   SERVICE LAYER    ║  ║     JOB QUEUES       ║
║  ts/state/    ║  ║   ts/services/     ║  ║     ts/jobs/         ║
║               ║  ║                    ║  ║                      ║
║ Redux Store   ║  ║ calling.preload    ║  ║ ConversationJobQueue ║
║ 43 ducks:     ║  ║  (135KB, RingRTC)  ║  ║ AttachDownloadMgr    ║
║               ║  ║ messageCache       ║  ║ AttachBackupMgr      ║
║ conversations ║  ║ messageUpdater     ║  ║ GroupAvatarJobs      ║
║ messages      ║  ║ linkPreview        ║  ║ (26 total job types) ║
║ calling       ║  ║ contactSync        ║  ║                      ║
║ composer      ║  ║ keyTransparency    ║  ║ Each job:            ║
║ audioPlayer   ║  ║ donations          ║  ║ - parseData()        ║
║ stickers      ║  ║ notifProfiles      ║  ║ - run()              ║
║ stories       ║  ║ expiringMessages   ║  ║ - retry + backoff    ║
║ globalModals  ║  ║ storageService     ║  ║ - persist to DB      ║
║ nav, search   ║  ║ activeWindow       ║  ║                      ║
║ + 32 more     ║  ╚════════╦═══════════╝  ╚══════════════════════╝
║               ║           ║
║ Middleware:   ║           ║
║ - redux-thunk ║           ║
║ - redux-promise           ║
╚═══════╦═══════╝           ║
        ║ dispatch/subscribe ║
╔═══════╩════════════════════╩═══════════════════════════════════════════╗
║                          PROTOCOL LAYER                                ║
║                        ts/textsecure/                                  ║
║                                                                        ║
║  ┌──────────────────────┐    ┌──────────────────────┐                 ║
║  │   MessageReceiver    │    │    SendMessage        │                 ║
║  │   .preload.ts (127KB)│    │    .preload.ts (79KB) │                 ║
║  │                      │    │                       │                 ║
║  │  WebSocket → decrypt │    │  encrypt → WebSocket  │                 ║
║  │  parse envelope      │    │  delivery receipts    │                 ║
║  │  → handleDataMessage │    │  retry logic          │                 ║
║  └──────────┬───────────┘    └──────────┬────────────┘                ║
║             ↓                           ↑                              ║
║  ┌──────────────────────┐    ┌──────────────────────┐                 ║
║  │  handleDataMessage   │    │  SignalProtocolStore  │                 ║
║  │  .preload.ts (28KB)  │    │  .preload.ts (83KB)  │                 ║
║  │                      │    │                       │                 ║
║  │ - validate sender    │    │  - key pairs storage  │                 ║
║  │ - process reactions  │    │  - identity store     │                 ║
║  │ - handle edits/dels  │    │  - session store      │                 ║
║  │ - group updates      │    │  - sender key store   │                 ║
║  └──────────┬───────────┘    └──────────────────────┘                 ║
║             ↓                                                          ║
║  ┌──────────────────────┐    ┌──────────────────────┐                 ║
║  │  WebAPI.preload.ts   │    │  Crypto.node.ts       │                 ║
║  │  (128KB)             │    │  AttachmentCrypto     │                 ║
║  │                      │    │  .node.ts (21KB)      │                 ║
║  │  - REST + WebSocket  │    │                       │                 ║
║  │  - auth tokens       │    │  libsignal v0.91.0:   │                 ║
║  │  - CDN media upload  │    │  - Double Ratchet     │                 ║
║  │  - server cert pin   │    │  - X3DH / HKDF       │                 ║
║  └──────────────────────┘    │  - AES-256            │                 ║
║                              │  - Curve25519         │                 ║
║                              └──────────────────────┘                 ║
╚═══════════════════════════════╦════════════════════════════════════════╝
                                ║
╔═══════════════════════════════╩════════════════════════════════════════╗
║                      DATABASE LAYER (Worker Thread)                    ║
║                                                                        ║
║  Main Thread                  Worker Thread (separate Node.js thread)  ║
║  ────────────────────────     ──────────────────────────────────────── ║
║  ts/sql/Client.preload.ts ←→ ts/sql/Server.node.ts (249 KB)           ║
║  (24 KB interface)            (SQLCipher encrypted SQLite)             ║
║                               ts/sql/mainWorker.node.ts                ║
║                               133 migration files                      ║
║                                                                        ║
║  Tables: messages, conversations, identityKeys, sessions, jobs, ...    ║
╚═══════════════════════════════╦════════════════════════════════════════╝
                                ║
╔═══════════════════════════════╩════════════════════════════════════════╗
║                          UI LAYER (React)                              ║
║                        ts/components/ (424 files)                      ║
║                                                                        ║
║  Windows:                   Smart Components (ts/state/smart/):        ║
║  ├── main (primary app)     └── connect Redux state → dumb components  ║
║  ├── about                                                             ║
║  ├── callDiagnostic         Reselect selectors (ts/state/selectors/)   ║
║  ├── debugLog                                                          ║
║  ├── permissions            Feature areas:                             ║
║  ├── screenShare            ├── ConversationList, ConversationView     ║
║  └── sticker-creator        ├── MessageBubble, ComposerBox            ║
║                             ├── CallingLobby, VideoCall                ║
║                             ├── MediaGallery, LightBox                 ║
║                             └── Settings, Stories, Stickers            ║
╚════════════════════════════════════════════════════════════════════════╝
```

---

## Message Flow — Receive

```
Signal Server
     │ WebSocket (TLS + cert pinning)
     ↓
MessageReceiver.preload.ts (ts/textsecure/)
     │ decrypt envelope (libsignal)
     ↓
handleDataMessage.preload.ts (ts/messages/)
     │ validate sender, extract content
     ↓
saveAndNotify.preload.ts ──→ SQL DB (Worker Thread)
     │                  └──→ Desktop Notification (maybeNotify.preload.ts)
     ↓
Redux dispatch → conversations/messages duck
     ↓
React re-render (MessageBubble, ConversationView)
```

## Message Flow — Send

```
User types → ComposerBox component
     │ Redux action dispatched
     ↓
ConversationJobQueue (ts/jobs/)
     │ pick up job, retry on failure
     ↓
SendMessage.preload.ts (ts/textsecure/)
     │ encrypt with libsignal (per-device)
     ↓
WebAPI.preload.ts
     │ POST /v1/messages (REST)
     ↓
Signal Server → recipient devices
```

---

## Calling Flow

```
Incoming/Outgoing Call
     │
     ↓
ts/services/calling.preload.ts (135 KB)
     │ RingRTC native library (@signalapp/ringrtc v2.67.0)
     │
     ├─→ Redux: ts/state/ducks/calling.preload.ts (132 KB)
     │         ↓
     │   UI: CallingLobby → ActiveCall → VideoCall components
     │
     ├─→ Screen Share: screenShare.html (separate window)
     │
     └─→ VideoSupport.preload.ts (device capability check)
```

---

## IPC Communication Map

```
┌───────────────────────┐         ┌────────────────────────────┐
│    Renderer Process    │  IPC    │      Main Process           │
│                        │ ←────→ │                              │
│  window.IPC (50+ methods)       │  ipcMain.handle(...)         │
│                        │        │                              │
│  SQL:                  │        │  sql_channel.main.ts         │
│  ipc.invoke('sql-     │ ─────→ │  ├── sqlReadSerialized()     │
│   channel:read')       │ ←───── │  └── sqlWriteSerialized()    │
│                        │        │                              │
│  Settings:             │        │  settingsChannel.main.ts     │
│  ipc.invoke('settings │ ─────→ │  ├── get: theme, spellCheck  │
│   :get:*')             │ ←───── │  └── set: + broadcast update │
│                        │        │                              │
│  Attachments:          │        │  attachment_channel.main.ts  │
│  stream-based          │ ─────→ │  ├── encrypted file I/O     │
│  large file transfer   │ ←───── │  └── resumable downloads    │
│                        │        │                              │
│  Power Events:         │        │  powerChannel.main.ts        │
│  (listen only)         │ ←───── │  ├── suspend / resume        │
│                        │        │  └── lock-screen             │
└───────────────────────┘         └────────────────────────────┘
```

---

## Redux State Architecture

```
createStore.preload.ts
     │
     ↓
Middleware Pipeline:
  1. redux-promise-middleware (async actions)
  2. redux-thunk (action creators)
  3. dispatchItemsMiddleware (custom)
  4. actionRateLogger (throttle logging)
     │
     ↓
reducer.preload.ts (combines 43 ducks)
     │
     ├── conversations    ← conversation list & metadata
     ├── messages         ← message content & state
     ├── calling          ← active/incoming calls, RingRTC state
     ├── callHistory      ← past call records
     ├── composer         ← message composition
     ├── audioPlayer      ← voice message playback
     ├── audioRecorder    ← voice recording
     ├── stickers         ← sticker packs
     ├── stories          ← story state
     ├── storyDistributionLists
     ├── search           ← search queries & results
     ├── nav              ← navigation state
     ├── globalModals     ← modal visibility
     ├── toast            ← toast notifications
     ├── lightbox         ← image viewer
     ├── mediaGallery     ← media browser
     ├── emojis           ← emoji state
     ├── gifs             ← GIF picker
     ├── linkPreviews     ← URL previews
     ├── badges           ← user badges
     ├── donations        ← donation/subscription state
     ├── user             ← current user info
     ├── accounts         ← multi-account
     ├── username         ← username management
     ├── items            ← settings/preferences
     ├── notificationProfiles
     ├── chatFolders      ← folder organization
     ├── app              ← app-level state
     ├── backups          ← backup state
     ├── crashReports     ← crash reporting
     ├── megaphones       ← in-app announcements
     ├── safetyNumber     ← verification state
     ├── inbox            ← inbox state
     └── ... (43 total)
```

---

## Job Queue System

```
ts/jobs/JobManager.std.ts (base class)
     │
     ├── ConversationJobQueue.preload.ts (38 KB)
     │   └── message send, reactions, read receipts, typing indicators
     │
     ├── AttachmentDownloadManager.preload.ts
     │   └── queue & prioritize attachment downloads
     │
     ├── AttachmentBackupManager.preload.ts
     │   └── encrypted cloud backup of attachments
     │
     ├── CallLinkFinalizeDeleteManager
     │   └── clean up call link resources
     │
     └── 22 more specialized job types...

Job Lifecycle:
  1. parseData() → deserialize from SQLite
  2. run()       → execute async operation
  3. On failure  → retry with exponential backoff
  4. persist     → survive app restarts via DB
```

---

## Storage Layout (Filesystem)

```
{userData}/
├── attachments/          ← encrypted message media
├── draft-attachments/    ← in-progress drafts
├── stickers/             ← sticker pack assets
├── downloads/            ← downloaded files
├── avatars/              ← profile & group avatars
├── signal.db             ← SQLCipher encrypted SQLite
├── config.json           ← user preferences
└── ephemeral_config.json ← volatile settings
```

---

## Build & Bundle Configuration

```
rolldown.config.ts
     │
     ├── Entry Points:
     │   ├── app/main.main.ts              → bundles/main.js
     │   ├── ts/windows/main/preload.ts    → bundles/preload/wrapper.js
     │   ├── ts/sql/mainWorker.node.ts     → bundles/workers/sql.js
     │   ├── ts/workers/heicConverter.ts   → bundles/workers/heic.js
     │   └── Context-isolated preloads (about, callDiagnostic, etc.)
     │
     ├── Output: bundles/ directory (CJS format)
     │
     └── Externals: native modules, electron, emoji, libphonenumber

Key Dependencies:
  @signalapp/libsignal-client  v0.91.0  (Signal Protocol)
  @signalapp/ringrtc           v2.67.0  (Voice/Video calls)
  @signalapp/sqlcipher          v3.2.1  (Encrypted SQLite)
  electron                     v40.8.5  (Desktop framework)
  react                       v19.2.14  (UI library)
  redux + middleware                     (State management)
  typescript                     v7.0    (Language)
  rolldown                               (Bundler)
```

---

## Where to Add New Features

| Feature Type        | Primary Files to Modify                                                          | Pattern to Follow           |
|---------------------|----------------------------------------------------------------------------------|-----------------------------|
| New message type    | ts/messages/handleDataMessage.preload.ts, ts/textsecure/SendMessage.preload.ts   | Extend proto handling       |
| New UI panel/modal  | ts/components/, ts/state/ducks/globalModals.preload.ts                           | New duck + component        |
| New setting         | ts/main/settingsChannel.main.ts, ts/state/ducks/items.preload.ts                | IPC handler + Redux         |
| New background job  | ts/jobs/, ts/jobs/conversationJobQueue.preload.ts                                | New job class + register    |
| New IPC channel     | app/main.main.ts, ts/windows/main/phase1-ipc.preload.ts                         | ipcMain.handle + window.IPC |
| New DB table/query  | ts/sql/Server.node.ts, ts/sql/Interface.std.ts, ts/sql/migrations/              | Migration + interface       |
| New window          | ts/windows/, rolldown.config.ts, app/main.main.ts                                | New HTML + preload + entry  |
| Calling feature     | ts/services/calling.preload.ts, ts/state/ducks/calling.preload.ts               | RingRTC hooks               |
| New React component | ts/components/, ts/state/smart/                                                  | Component + smart wrapper   |
