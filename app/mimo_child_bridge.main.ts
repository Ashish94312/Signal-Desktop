// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * MiMo child-process bridge shim (main process).
 *
 * Forks @mimo/client as a plain Node child process (IPC-only, no UI),
 * then relays bridge messages between the child and the Signal renderer.
 *
 * Child → renderer (via webContents.send):
 *   join-call, leave-call, get-our-aci, get-conversation, get-screen-sources
 *
 * Renderer → child (via child.send):
 *   call-state-changed, signal-ready, request responses
 */

import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { BrowserWindow } from 'electron';
import { ipcMain as ipc } from 'electron';

import { createLogger } from '../ts/logging/log.std.ts';
import { getAppRootDir } from '../ts/util/appRootDir.main.ts';

const log = createLogger('mimoBridge');

// ── IPC channel names (shared with mimoBridgeRenderer.preload.ts) ──────────
const R_CALL_STATE        = 'mimo:bridge-call-state';
const R_JOIN_CALL         = 'mimo:bridge-join-call';
const R_LEAVE_CALL        = 'mimo:bridge-leave-call';
const R_GET_OUR_ACI       = 'mimo:bridge-get-our-aci';
const R_GET_OUR_ACI_RESP  = 'mimo:bridge-get-our-aci:response';
const R_GET_CONV          = 'mimo:bridge-get-conversation';
const R_GET_CONV_RESP     = 'mimo:bridge-get-conversation:response';
const R_GET_SOURCES       = 'mimo:bridge-get-screen-sources';
const R_GET_SOURCES_RESP  = 'mimo:bridge-get-screen-sources:response';

type BridgeMsg = { channel: string; args: Array<unknown> };

function sendToChild(child: ChildProcess, channel: string, ...args: Array<unknown>): void {
  child.send({ channel, args });
}

/**
 * Start the MiMo child-process bridge.
 * Call once from app/main.main.ts right after `createWindow()` resolves.
 */
export function startMimoBridgeShim(win: BrowserWindow): void {
  const rootDir = getAppRootDir();

  // Resolve the @mimo/client dist entry:
  //   1. MIMO_CLIENT_MAIN env var (absolute path) — lets production packaging override
  //   2. Sibling workspace path (development layout)
  const clientMain =
    process.env.MIMO_CLIENT_MAIN ??
    join(
      rootDir,
      '..',
      'mimo-remote-therapy',
      'packages',
      'client',
      'dist',
      'main',
      'index.js'
    );

  if (!existsSync(clientMain)) {
    log.warn(
      `mimo bridge: @mimo/client not found at ${clientMain} — bridge disabled`
    );
    return;
  }

  log.info(`mimo bridge: forking ${clientMain}`);

  const child = fork(clientMain, [], {
    // cwd = package root so that relative FS operations land in the right place
    cwd: dirname(dirname(clientMain)),  // dist/main → dist → client/
    env: { ...process.env, MIMO_BRIDGE_MODE: 'child' },
    execArgv: [], // do not inherit Electron's execArgv flags
  });

  // ── Child → renderer relay ───────────────────────────────────────────────
  child.on('message', (raw: unknown) => {
    if (!raw || typeof raw !== 'object' || !('channel' in raw)) {
      return;
    }
    const { channel, args } = raw as BridgeMsg;

    switch (channel) {
      case 'mimo-bridge:join-call':
        win.webContents.send(R_JOIN_CALL, args[0]);
        break;
      case 'mimo-bridge:leave-call':
        win.webContents.send(R_LEAVE_CALL, args[0]);
        break;
      case 'mimo-bridge:get-our-aci':
        win.webContents.send(R_GET_OUR_ACI);
        break;
      case 'mimo-bridge:get-conversation':
        win.webContents.send(R_GET_CONV, args[0]);
        break;
      case 'mimo-bridge:get-screen-sources':
        win.webContents.send(R_GET_SOURCES);
        break;
      case 'mimo-bridge:mimo-ready':
        log.info('mimo bridge: child process ready');
        sendToChild(child, 'mimo-bridge:signal-ready', {});
        break;
      default:
        break;
    }
  });

  child.on('error', err =>
    log.error('mimo bridge: child process error', String(err))
  );
  child.on('exit', (code, signal) =>
    log.info(`mimo bridge: child exited code=${code} signal=${signal}`)
  );

  // ── Renderer → child relay ───────────────────────────────────────────────

  // Call state updates (Redux subscriber in renderer → child)
  ipc.on(R_CALL_STATE, (_event, payload: unknown) => {
    sendToChild(child, 'mimo-bridge:call-state-changed', payload);
  });

  // Request-response: get-our-aci
  ipc.on(R_GET_OUR_ACI_RESP, (_event, aci: unknown) => {
    sendToChild(child, 'mimo-bridge:get-our-aci:response', aci);
  });

  // Request-response: get-conversation
  ipc.on(R_GET_CONV_RESP, (_event, info: unknown) => {
    sendToChild(child, 'mimo-bridge:get-conversation:response', info);
  });

  // Request-response: get-screen-sources
  ipc.on(R_GET_SOURCES_RESP, (_event, sources: unknown) => {
    sendToChild(child, 'mimo-bridge:get-screen-sources:response', sources);
  });

  // Clean up child when the app quits
  process.on('exit', () => child.kill());

  log.info('mimo bridge: shim ready');
}
