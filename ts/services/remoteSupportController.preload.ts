// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../logging/log.std.ts';
import {
  sendRemoteControlResponse,
  sendRustDeskCredentials,
  sendRustDeskSessionEnded,
} from './mimoMessageSender.preload.ts';
import {
  checkRustDeskAvailability,
  startRustDeskService,
  stopRustDeskService,
} from './rustdeskBridge.preload.ts';

const log = createLogger('remoteSupportController');
const CREDENTIAL_TTL_MS = 5 * 60 * 1000;

export type RemoteSupportStatus =
  | 'idle'
  | 'request_received'
  | 'active'
  | 'ended'
  | 'expired'
  | 'unavailable';

export type RemoteSupportState = Readonly<{
  status: RemoteSupportStatus;
  therapistSessionId: string | null;
  rustDeskId: string | null;
  rustDeskPassword: string | null;
  issuedAtUnixMs: number | null;
  expiresAtUnixMs: number | null;
  error: string | null;
}>;

type Listener = () => void;

const listeners = new Set<Listener>();
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

let state: RemoteSupportState = {
  status: 'idle',
  therapistSessionId: null,
  rustDeskId: null,
  rustDeskPassword: null,
  issuedAtUnixMs: null,
  expiresAtUnixMs: null,
  error: null,
};

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(next: Partial<RemoteSupportState>): void {
  state = { ...state, ...next };
  emit();
}

function clearExpiryTimer(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

function scheduleExpiry(
  therapistSessionId: string,
  expiresAtUnixMs: number
): void {
  clearExpiryTimer();
  const delayMs = Math.max(0, expiresAtUnixMs - Date.now());
  expiryTimer = setTimeout(() => {
    void (async () => {
      stopRustDeskService();
      await sendRustDeskSessionEnded(therapistSessionId);
      setState({
        status: 'expired',
        rustDeskPassword: null,
        expiresAtUnixMs: Date.now(),
      });
    })();
  }, delayMs);
}

export function subscribeRemoteSupport(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRemoteSupportState(): RemoteSupportState {
  return state;
}

export async function onRemoteControlRequestReceived(
  therapistSessionId: string
): Promise<void> {
  if (
    state.status === 'active' &&
    state.therapistSessionId &&
    state.therapistSessionId !== therapistSessionId
  ) {
    await sendRemoteControlResponse(
      therapistSessionId,
      false,
      'Another remote support session is already active'
    );
    return;
  }

  setState({
    status: 'request_received',
    therapistSessionId,
    rustDeskId: null,
    rustDeskPassword: null,
    issuedAtUnixMs: null,
    expiresAtUnixMs: null,
    error: null,
  });
}

export async function approveRemoteSupportRequest(): Promise<void> {
  const therapistSessionId = state.therapistSessionId;
  if (!therapistSessionId) {
    return;
  }

  const available = await checkRustDeskAvailability();
  if (!available) {
    await sendRemoteControlResponse(
      therapistSessionId,
      false,
      'RustDesk unavailable on client'
    );
    setState({
      status: 'unavailable',
      error: 'RustDesk is not installed or unavailable on this client.',
    });
    return;
  }

  await sendRemoteControlResponse(therapistSessionId, true);

  const credentials = await startRustDeskService();
  if (!credentials) {
    await sendRemoteControlResponse(
      therapistSessionId,
      false,
      'Failed to start RustDesk service'
    );
    setState({
      status: 'unavailable',
      error: 'Failed to start RustDesk service.',
    });
    return;
  }

  const issuedAtUnixMs = Date.now();
  const expiresAtUnixMs = issuedAtUnixMs + CREDENTIAL_TTL_MS;

  await sendRustDeskCredentials(
    therapistSessionId,
    credentials.id,
    credentials.password
  );

  setState({
    status: 'active',
    therapistSessionId,
    rustDeskId: credentials.id,
    rustDeskPassword: credentials.password,
    issuedAtUnixMs,
    expiresAtUnixMs,
    error: null,
  });
  scheduleExpiry(therapistSessionId, expiresAtUnixMs);
}

export async function declineRemoteSupportRequest(): Promise<void> {
  const therapistSessionId = state.therapistSessionId;
  if (!therapistSessionId) {
    return;
  }

  await sendRemoteControlResponse(
    therapistSessionId,
    false,
    'Client declined remote access request'
  );

  setState({
    status: 'idle',
    therapistSessionId: null,
    rustDeskId: null,
    rustDeskPassword: null,
    issuedAtUnixMs: null,
    expiresAtUnixMs: null,
    error: null,
  });
}

export async function endRemoteSupportSession(): Promise<void> {
  const therapistSessionId = state.therapistSessionId;

  stopRustDeskService();
  clearExpiryTimer();

  if (therapistSessionId) {
    await sendRustDeskSessionEnded(therapistSessionId);
  }

  setState({
    status: 'ended',
    rustDeskPassword: null,
    expiresAtUnixMs: null,
  });
}

export async function onRemoteReleaseReceived(
  therapistSessionId: string
): Promise<void> {
  if (state.therapistSessionId && state.therapistSessionId !== therapistSessionId) {
    return;
  }

  stopRustDeskService();
  clearExpiryTimer();

  if (state.therapistSessionId) {
    await sendRustDeskSessionEnded(state.therapistSessionId);
  }

  setState({
    status: 'ended',
    therapistSessionId: null,
    rustDeskPassword: null,
    expiresAtUnixMs: null,
    error: null,
  });
}

export async function onRustDeskSessionEndedReceived(
  therapistSessionId: string
): Promise<void> {
  if (state.therapistSessionId && state.therapistSessionId !== therapistSessionId) {
    return;
  }

  stopRustDeskService();
  clearExpiryTimer();
  setState({
    status: 'ended',
    therapistSessionId: null,
    rustDeskPassword: null,
    expiresAtUnixMs: null,
    error: null,
  });
}

export function resetRemoteSupportError(): void {
  if (!state.error) {
    return;
  }
  setState({ error: null });
}

log.info('remote support controller initialized');

