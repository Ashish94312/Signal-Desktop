// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReadonlyDeep } from 'type-fest';

import type { AnyAction } from 'redux';

import type {
  MiMoClientSnapshotType,
  MiMoMetadataIngestPayloadType,
} from '../../types/MiMoMetadata.std.ts';

const INGEST_MIMO_METADATA = 'mimoSession/INGEST_MIMO_METADATA';

export type MimoSessionStateType = ReadonlyDeep<{
  clients: Record<string, MiMoClientSnapshotType>;
}>;

type IngestMimoMetadataActionType = ReadonlyDeep<{
  type: typeof INGEST_MIMO_METADATA;
  payload: MiMoMetadataIngestPayloadType;
}>;

function ingestMetadata(
  payload: MiMoMetadataIngestPayloadType
): IngestMimoMetadataActionType {
  return {
    type: INGEST_MIMO_METADATA,
    payload,
  };
}

export const actions = {
  ingestMetadata,
};

export function getEmptyState(): MimoSessionStateType {
  return { clients: {} };
}

export function reducer(
  state: MimoSessionStateType = getEmptyState(),
  action: AnyAction
): MimoSessionStateType {
  if (action.type !== INGEST_MIMO_METADATA) {
    return state;
  }

  const {
    clientSessionId,
    gameId,
    heartbeatUnixMs,
    sessionStatus,
    connectivityState,
    currentModule,
    expectedActivityType,
    activityProgress,
    alerts,
    snapshotRef,
  } = action.payload as MiMoMetadataIngestPayloadType;
  if (!clientSessionId) {
    return state;
  }

  const previous = state.clients[clientSessionId];
  const receivedAtUnixMs = Date.now();
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
  };

  return {
    ...state,
    clients: {
      ...state.clients,
      [clientSessionId]: next,
    },
  };
}
