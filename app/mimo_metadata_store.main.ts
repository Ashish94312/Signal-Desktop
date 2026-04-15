// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  MiMoAlertPayloadType,
  MiMoConnectivityStateType,
  MiMoMetadataIngestPayloadType,
  MiMoSessionStatusType,
} from '../ts/types/MiMoMetadata.std.ts';

export type MiMoMetadataSnapshotType = Readonly<{
  clientSessionId: string;
  gameId: string | null;
  heartbeatUnixMs: number | null;
  sessionStatus: MiMoSessionStatusType | null;
  connectivityState: MiMoConnectivityStateType | null;
  currentModule: string | null;
  expectedActivityType: string | null;
  activityProgress: number | null;
  alerts: ReadonlyArray<MiMoAlertPayloadType>;
  snapshotRef: string | null;
  lastIngestedUnixMs: number;
}>;

export type MiMoMetadataStoreSnapshotType = Readonly<{
  clients: ReadonlyArray<MiMoMetadataSnapshotType>;
  totalClients: number;
}>;

const metadataByClientSessionId = new Map<string, MiMoMetadataSnapshotType>();

export function ingestMiMoMetadata(
  payload: MiMoMetadataIngestPayloadType
): MiMoMetadataSnapshotType {
  const previous = metadataByClientSessionId.get(payload.clientSessionId);
  const next: MiMoMetadataSnapshotType = {
    clientSessionId: payload.clientSessionId,
    gameId:
      payload.gameId !== undefined
        ? payload.gameId
        : previous?.gameId ?? null,
    heartbeatUnixMs:
      payload.heartbeatUnixMs !== undefined
        ? payload.heartbeatUnixMs
        : previous?.heartbeatUnixMs ?? null,
    sessionStatus:
      payload.sessionStatus !== undefined
        ? payload.sessionStatus
        : previous?.sessionStatus ?? null,
    connectivityState:
      payload.connectivityState !== undefined
        ? payload.connectivityState
        : previous?.connectivityState ?? null,
    currentModule:
      payload.currentModule !== undefined
        ? payload.currentModule
        : previous?.currentModule ?? null,
    expectedActivityType:
      payload.expectedActivityType !== undefined
        ? payload.expectedActivityType
        : previous?.expectedActivityType ?? null,
    activityProgress:
      payload.activityProgress !== undefined
        ? payload.activityProgress
        : previous?.activityProgress ?? null,
    alerts:
      payload.alerts !== undefined
        ? payload.alerts
        : previous?.alerts ?? [],
    snapshotRef:
      payload.snapshotRef !== undefined
        ? payload.snapshotRef
        : previous?.snapshotRef ?? null,
    lastIngestedUnixMs: Date.now(),
  };

  metadataByClientSessionId.set(next.clientSessionId, next);

  return next;
}

export function getMiMoMetadataStoreSnapshot(): MiMoMetadataStoreSnapshotType {
  const clients = Array.from(metadataByClientSessionId.values()).sort(
    (left, right) => right.lastIngestedUnixMs - left.lastIngestedUnixMs
  );

  return {
    clients,
    totalClients: clients.length,
  };
}

export function clearMiMoMetadataStore(): void {
  metadataByClientSessionId.clear();
}
