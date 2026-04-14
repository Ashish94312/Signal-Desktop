// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Payload received from MiMo client / orchestrator / demo menu.
 * Keep fields JSON-serializable for IPC and future WebSocket bridge.
 */
export type MiMoSessionStatusType = 'active' | 'paused' | 'ended';

export type MiMoConnectivityStateType = 'online' | 'reconnecting' | 'offline';

export type MiMoAlertSeverityType = 'green' | 'yellow' | 'red';

export type MiMoAlertTypeString =
  | 'inactivity'
  | 'no_user'
  | 'no_progress'
  | 'mismatch'
  | 'disconnected'
  | 'no_motion';

export type MiMoAlertPayloadType = Readonly<{
  alertId: string;
  type: MiMoAlertTypeString;
  severity: MiMoAlertSeverityType;
  message: string;
  timestamp: number;
}>;

export type MiMoMetadataPayloadType = Readonly<{
  clientSessionId: string;
  gameId?: string | null;
  /** When the client emitted the heartbeat (ms since Unix epoch). Defaults to ingest time. */
  heartbeatUnixMs?: number;
  sessionStatus?: MiMoSessionStatusType;
  connectivityState?: MiMoConnectivityStateType;
  currentModule?: string | null;
  expectedActivityType?: string | null;
  activityProgress?: number | null;
  alerts?: ReadonlyArray<MiMoAlertPayloadType>;
  snapshotRef?: string | null;
}>;

/** Backward-compatible alias for the HTTP ingest endpoint. */
export type MiMoMetadataIngestPayloadType = MiMoMetadataPayloadType;

export type MiMoClientSnapshotType = Readonly<{
  clientSessionId: string;
  gameId: string | null;
  lastHeartbeatUnixMs: number;
  /** When this app received the snapshot (ms since Unix epoch). */
  receivedAtUnixMs: number;
  sessionStatus: MiMoSessionStatusType | null;
  connectivityState: MiMoConnectivityStateType | null;
  currentModule: string | null;
  expectedActivityType: string | null;
  activityProgress: number | null;
  alerts: ReadonlyArray<MiMoAlertPayloadType>;
  snapshotRef: string | null;
  rustDeskState: 'idle' | 'requested' | 'ready' | 'ended' | 'expired';
  rustDeskId: string | null;
  rustDeskPassword: string | null;
  rustDeskIssuedAtUnixMs: number | null;
  rustDeskExpiresAtUnixMs: number | null;
  rustDeskLastEventUnixMs: number | null;
}>;
