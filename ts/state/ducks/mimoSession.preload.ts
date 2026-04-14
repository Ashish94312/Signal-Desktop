// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReadonlyDeep } from 'type-fest';

import type { AnyAction } from 'redux';

import type {
  MiMoClientSnapshotType,
  MiMoMetadataIngestPayloadType,
} from '../../types/MiMoMetadata.std.ts';

const INGEST_MIMO_METADATA = 'mimoSession/INGEST_MIMO_METADATA';
const MARK_RUSTDESK_REQUESTED = 'mimoSession/MARK_RUSTDESK_REQUESTED';
const INGEST_RUSTDESK_CREDENTIALS = 'mimoSession/INGEST_RUSTDESK_CREDENTIALS';
const MARK_RUSTDESK_ENDED = 'mimoSession/MARK_RUSTDESK_ENDED';
const EXPIRE_RUSTDESK_CREDENTIALS = 'mimoSession/EXPIRE_RUSTDESK_CREDENTIALS';

export type MimoSessionStateType = ReadonlyDeep<{
  clients: Record<string, MiMoClientSnapshotType>;
}>;

type IngestMimoMetadataActionType = ReadonlyDeep<{
  type: typeof INGEST_MIMO_METADATA;
  payload: MiMoMetadataIngestPayloadType;
}>;

type MarkRustDeskRequestedActionType = ReadonlyDeep<{
  type: typeof MARK_RUSTDESK_REQUESTED;
  payload: { clientSessionId: string; atUnixMs?: number };
}>;

type IngestRustDeskCredentialsActionType = ReadonlyDeep<{
  type: typeof INGEST_RUSTDESK_CREDENTIALS;
  payload: {
    clientSessionId: string;
    rustdeskId: string;
    temporaryPassword: string;
    issuedAtUnixMs?: number;
    ttlMs?: number;
  };
}>;

type MarkRustDeskEndedActionType = ReadonlyDeep<{
  type: typeof MARK_RUSTDESK_ENDED;
  payload: { clientSessionId: string; atUnixMs?: number };
}>;

type ExpireRustDeskCredentialsActionType = ReadonlyDeep<{
  type: typeof EXPIRE_RUSTDESK_CREDENTIALS;
  payload: { clientSessionId: string; atUnixMs?: number };
}>;

function ingestMetadata(
  payload: MiMoMetadataIngestPayloadType
): IngestMimoMetadataActionType {
  return {
    type: INGEST_MIMO_METADATA,
    payload,
  };
}

function markRustDeskRequested(
  payload: MarkRustDeskRequestedActionType['payload']
): MarkRustDeskRequestedActionType {
  return {
    type: MARK_RUSTDESK_REQUESTED,
    payload,
  };
}

function ingestRustDeskCredentials(
  payload: IngestRustDeskCredentialsActionType['payload']
): IngestRustDeskCredentialsActionType {
  return {
    type: INGEST_RUSTDESK_CREDENTIALS,
    payload,
  };
}

function markRustDeskEnded(
  payload: MarkRustDeskEndedActionType['payload']
): MarkRustDeskEndedActionType {
  return {
    type: MARK_RUSTDESK_ENDED,
    payload,
  };
}

function expireRustDeskCredentials(
  payload: ExpireRustDeskCredentialsActionType['payload']
): ExpireRustDeskCredentialsActionType {
  return {
    type: EXPIRE_RUSTDESK_CREDENTIALS,
    payload,
  };
}

export const actions = {
  ingestMetadata,
  markRustDeskRequested,
  ingestRustDeskCredentials,
  markRustDeskEnded,
  expireRustDeskCredentials,
};

export function getEmptyState(): MimoSessionStateType {
  return { clients: {} };
}

export function reducer(
  state: MimoSessionStateType = getEmptyState(),
  action: AnyAction
): MimoSessionStateType {
  if (
    action.type !== INGEST_MIMO_METADATA &&
    action.type !== MARK_RUSTDESK_REQUESTED &&
    action.type !== INGEST_RUSTDESK_CREDENTIALS &&
    action.type !== MARK_RUSTDESK_ENDED &&
    action.type !== EXPIRE_RUSTDESK_CREDENTIALS
  ) {
    return state;
  }

  const payload = action.payload as
    | MiMoMetadataIngestPayloadType
    | MarkRustDeskRequestedActionType['payload']
    | IngestRustDeskCredentialsActionType['payload']
    | MarkRustDeskEndedActionType['payload']
    | ExpireRustDeskCredentialsActionType['payload'];
  const clientSessionId = payload.clientSessionId;
  if (!clientSessionId) {
    return state;
  }

  const previous = state.clients[clientSessionId];
  const now = Date.now();

  if (action.type === MARK_RUSTDESK_REQUESTED) {
    const atUnixMs = (payload as MarkRustDeskRequestedActionType['payload']).atUnixMs ?? now;

    const next: MiMoClientSnapshotType = {
      clientSessionId,
      gameId: previous?.gameId ?? null,
      lastHeartbeatUnixMs: previous?.lastHeartbeatUnixMs ?? atUnixMs,
      receivedAtUnixMs: previous?.receivedAtUnixMs ?? atUnixMs,
      sessionStatus: previous?.sessionStatus ?? null,
      connectivityState: previous?.connectivityState ?? null,
      currentModule: previous?.currentModule ?? null,
      expectedActivityType: previous?.expectedActivityType ?? null,
      activityProgress: previous?.activityProgress ?? null,
      alerts: previous?.alerts ?? [],
      snapshotRef: previous?.snapshotRef ?? null,
      rustDeskState: 'requested',
      rustDeskId: null,
      rustDeskPassword: null,
      rustDeskIssuedAtUnixMs: null,
      rustDeskExpiresAtUnixMs: null,
      rustDeskLastEventUnixMs: atUnixMs,
    };

    return {
      ...state,
      clients: {
        ...state.clients,
        [clientSessionId]: next,
      },
    };
  }

  if (action.type === INGEST_RUSTDESK_CREDENTIALS) {
    const rustdeskPayload = payload as IngestRustDeskCredentialsActionType['payload'];
    const issuedAtUnixMs = rustdeskPayload.issuedAtUnixMs ?? now;
    const ttlMs = rustdeskPayload.ttlMs ?? 5 * 60 * 1000;

    const next: MiMoClientSnapshotType = {
      clientSessionId,
      gameId: previous?.gameId ?? null,
      lastHeartbeatUnixMs: previous?.lastHeartbeatUnixMs ?? issuedAtUnixMs,
      receivedAtUnixMs: previous?.receivedAtUnixMs ?? issuedAtUnixMs,
      sessionStatus: previous?.sessionStatus ?? null,
      connectivityState: previous?.connectivityState ?? null,
      currentModule: previous?.currentModule ?? null,
      expectedActivityType: previous?.expectedActivityType ?? null,
      activityProgress: previous?.activityProgress ?? null,
      alerts: previous?.alerts ?? [],
      snapshotRef: previous?.snapshotRef ?? null,
      rustDeskState: 'ready',
      rustDeskId: rustdeskPayload.rustdeskId,
      rustDeskPassword: rustdeskPayload.temporaryPassword,
      rustDeskIssuedAtUnixMs: issuedAtUnixMs,
      rustDeskExpiresAtUnixMs: issuedAtUnixMs + ttlMs,
      rustDeskLastEventUnixMs: issuedAtUnixMs,
    };

    return {
      ...state,
      clients: {
        ...state.clients,
        [clientSessionId]: next,
      },
    };
  }

  if (action.type === MARK_RUSTDESK_ENDED) {
    if (!previous) {
      return state;
    }
    const atUnixMs = (payload as MarkRustDeskEndedActionType['payload']).atUnixMs ?? now;
    const next: MiMoClientSnapshotType = {
      ...previous,
      rustDeskState: 'ended',
      rustDeskPassword: null,
      rustDeskExpiresAtUnixMs: null,
      rustDeskLastEventUnixMs: atUnixMs,
    };
    return {
      ...state,
      clients: {
        ...state.clients,
        [clientSessionId]: next,
      },
    };
  }

  if (action.type === EXPIRE_RUSTDESK_CREDENTIALS) {
    if (!previous) {
      return state;
    }
    const atUnixMs =
      (payload as ExpireRustDeskCredentialsActionType['payload']).atUnixMs ?? now;
    const next: MiMoClientSnapshotType = {
      ...previous,
      rustDeskState: 'expired',
      rustDeskPassword: null,
      rustDeskExpiresAtUnixMs: atUnixMs,
      rustDeskLastEventUnixMs: atUnixMs,
    };
    return {
      ...state,
      clients: {
        ...state.clients,
        [clientSessionId]: next,
      },
    };
  }

  const {
    gameId,
    heartbeatUnixMs,
    sessionStatus,
    connectivityState,
    currentModule,
    expectedActivityType,
    activityProgress,
    alerts,
    snapshotRef,
  } = payload as MiMoMetadataIngestPayloadType;
  const receivedAtUnixMs = now;
  const lastHeartbeatUnixMs =
    heartbeatUnixMs ?? previous?.lastHeartbeatUnixMs ?? receivedAtUnixMs;

  const next: MiMoClientSnapshotType = {
    clientSessionId,
    gameId: gameId === undefined ? (previous?.gameId ?? null) : gameId,
    lastHeartbeatUnixMs,
    receivedAtUnixMs,
    sessionStatus:
      sessionStatus === undefined
        ? (previous?.sessionStatus ?? null)
        : sessionStatus,
    connectivityState:
      connectivityState === undefined
        ? (previous?.connectivityState ?? null)
        : connectivityState,
    currentModule:
      currentModule === undefined
        ? (previous?.currentModule ?? null)
        : currentModule,
    expectedActivityType:
      expectedActivityType === undefined
        ? (previous?.expectedActivityType ?? null)
        : expectedActivityType,
    activityProgress:
      activityProgress === undefined
        ? (previous?.activityProgress ?? null)
        : activityProgress,
    alerts: alerts === undefined ? (previous?.alerts ?? []) : alerts,
    snapshotRef:
      snapshotRef === undefined ? (previous?.snapshotRef ?? null) : snapshotRef,
    rustDeskState: previous?.rustDeskState ?? 'idle',
    rustDeskId: previous?.rustDeskId ?? null,
    rustDeskPassword: previous?.rustDeskPassword ?? null,
    rustDeskIssuedAtUnixMs: previous?.rustDeskIssuedAtUnixMs ?? null,
    rustDeskExpiresAtUnixMs: previous?.rustDeskExpiresAtUnixMs ?? null,
    rustDeskLastEventUnixMs: previous?.rustDeskLastEventUnixMs ?? null,
  };

  return {
    ...state,
    clients: {
      ...state.clients,
      [clientSessionId]: next,
    },
  };
}
