// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  MiMoAlertPayloadType,
  MiMoConnectivityStateType,
  MiMoMetadataPayloadType,
  MiMoSessionStatusType,
} from './MiMoMetadata.std.ts';

/**
 * Binary prefix prepended to the DataMessage body to distinguish MiMo protocol
 * messages from normal chat.
 */
export const MIMO_MESSAGE_PREFIX = '\x00MIMO\x01';

export const MIMO_PROTOCOL_VERSION = 1;

export type MiMoSessionStatePayloadType = Readonly<{
  sessionStatus?: MiMoSessionStatusType;
  connectivityState?: MiMoConnectivityStateType;
  currentModule?: string | null;
  expectedActivityType?: string | null;
  activityProgress?: number | null;
  snapshotRef?: string | null;
}>;

export type MiMoIncomingMessageType =
  | Readonly<{ kind: 'heartbeat'; payload: MiMoMetadataPayloadType }>
  | Readonly<{ kind: 'alert'; payload: MiMoAlertPayloadType }>
  | Readonly<{
      kind: 'remote_control_response';
      approved: boolean;
      reason?: string;
    }>
  | Readonly<{ kind: 'remote_release' }>
  | Readonly<{
      kind: 'rustdesk_credentials';
      rustdeskId: string;
      temporaryPassword: string;
    }>
  | Readonly<{ kind: 'rustdesk_session_ended' }>
  | Readonly<{ kind: 'session_state'; payload: MiMoSessionStatePayloadType }>
  | Readonly<{
      kind: 'focus_mode';
      focusedClientSessionId: string | null;
    }>
  | Readonly<{
      kind: 'breakout_direct_invite';
      /** Title of the group or call-link session the therapist left. */
      pausedSessionTitle?: string | null;
    }>;

export type MiMoOutgoingMessageType =
  | Readonly<{ kind: 'remote_control_request'; therapistId: string }>
  | Readonly<{ kind: 'remote_release' }>
  | Readonly<{
      kind: 'breakout_direct_invite';
      pausedSessionTitle?: string | null;
    }>;

export type MiMoMessageType = MiMoIncomingMessageType | MiMoOutgoingMessageType;

export type MiMoEnvelopeType = Readonly<{
  version: number;
  senderAci: string;
  timestamp: number;
  message: MiMoMessageType;
}>;

export function serializeMiMoEnvelope(envelope: MiMoEnvelopeType): string {
  return `${MIMO_MESSAGE_PREFIX}${JSON.stringify(envelope)}`;
}

export function isMiMoMessage(body: string | undefined | null): boolean {
  return typeof body === 'string' && body.startsWith(MIMO_MESSAGE_PREFIX);
}

export function parseMiMoEnvelope(
  body: string | undefined | null
): MiMoEnvelopeType | undefined {
  if (!isMiMoMessage(body)) {
    return undefined;
  }

  try {
    const json = body!.slice(MIMO_MESSAGE_PREFIX.length);
    return JSON.parse(json) as MiMoEnvelopeType;
  } catch {
    return undefined;
  }
}
