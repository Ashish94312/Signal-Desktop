// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { GroupCallConnectionState } from '../types/Calling.std.ts';
import type { MiMoAlertPayloadType } from '../types/MiMoMetadata.std.ts';

/**
 * Lightweight group/adhoc MiMo rules (participant → therapist).
 * Extend with per-participant / therapist-tile checks when you have a stable therapist id match in-call.
 */
export function computeMimoAlertsForGroupCall(params: {
  connectionState: GroupCallConnectionState;
  remoteParticipantsCount: number;
  now: number;
}): ReadonlyArray<MiMoAlertPayloadType> {
  const { connectionState, remoteParticipantsCount, now } = params;

  if (connectionState === GroupCallConnectionState.Reconnecting) {
    return [
      {
        alertId: 'group-reconnecting',
        type: 'disconnected',
        severity: 'yellow',
        message: 'Group call is reconnecting.',
        timestamp: now,
      },
    ];
  }

  if (
    connectionState === GroupCallConnectionState.Connected &&
    remoteParticipantsCount === 0
  ) {
    return [
      {
        alertId: 'group-no-remote-participants',
        type: 'no_user',
        severity: 'yellow',
        message: 'No remote participants visible in this session.',
        timestamp: now,
      },
    ];
  }

  return [];
}
