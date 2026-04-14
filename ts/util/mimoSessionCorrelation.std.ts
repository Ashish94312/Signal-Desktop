// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  ActiveCallType,
  GroupCallRemoteParticipantType,
} from '../types/Calling.std.ts';
import { CallMode as CallModeValue } from '../types/CallDisposition.std.ts';
import type { ConversationType } from '../state/ducks/conversations.preload.ts';
import type { MiMoClientSnapshotType } from '../types/MiMoMetadata.std.ts';

/** Ids to compare with MiMo `clientSessionId` (recommended: ACI string). */
export function getRemoteParticipantMiMoKeys(
  participant: GroupCallRemoteParticipantType
): ReadonlyArray<string> {
  const keys: Array<string> = [];
  if (participant.aci) {
    keys.push(participant.aci);
  }
  if (participant.serviceId) {
    keys.push(participant.serviceId);
  }
  return [...new Set(keys)];
}

export function getDirectRemoteMiMoKeys(
  activeCall: ActiveCallType
): ReadonlyArray<string> {
  if (activeCall.callMode !== CallModeValue.Direct) {
    return [];
  }
  const conv = activeCall.conversation as ConversationType;
  const fromConvo =
    typeof conv.serviceId === 'string' && conv.serviceId.length > 0
      ? [conv.serviceId]
      : [];
  const remote = activeCall.remoteParticipants[0];
  const fromRemote =
    remote && typeof remote.serviceId === 'string' && remote.serviceId.length > 0
      ? [remote.serviceId]
      : [];
  return [...new Set([...fromConvo, ...fromRemote])];
}

/** MiMo state keyed by `clientSessionId`; match direct peer ACI/service id keys. */
export function findMiMoSnapshotForDirectCall(
  clients: Readonly<Record<string, MiMoClientSnapshotType>>,
  activeCall: ActiveCallType
): MiMoClientSnapshotType | undefined {
  if (activeCall.callMode !== CallModeValue.Direct) {
    return undefined;
  }
  for (const key of getDirectRemoteMiMoKeys(activeCall)) {
    const snap = clients[key];
    if (snap) {
      return snap;
    }
  }
  return undefined;
}

/**
 * Match a console session tile (`id` = conversation id for direct, demux id string for group).
 */
export function findMiMoSnapshotForSessionTile(
  clients: Readonly<Record<string, MiMoClientSnapshotType>>,
  activeCall: ActiveCallType | undefined,
  sessionId: string
): MiMoClientSnapshotType | undefined {
  if (!activeCall) {
    return undefined;
  }
  if (activeCall.callMode === CallModeValue.Direct) {
    return findMiMoSnapshotForDirectCall(clients, activeCall);
  }
  const participant = activeCall.remoteParticipants.find(
    p => String(p.demuxId) === sessionId
  );
  if (!participant) {
    return undefined;
  }
  return findMiMoSnapshotForGroupParticipant(clients, participant);
}

/**
 * Resolve MiMo snapshot for a group/adhoc remote participant when `clientSessionId`
 * was set to their ACI or service id (see docs/MIMO_ARCHITECTURE_CONTRACT.md).
 */
export function findMiMoSnapshotForGroupParticipant(
  clients: Readonly<Record<string, MiMoClientSnapshotType>>,
  participant: GroupCallRemoteParticipantType
): MiMoClientSnapshotType | undefined {
  for (const key of getRemoteParticipantMiMoKeys(participant)) {
    const snap = clients[key];
    if (snap) {
      return snap;
    }
  }
  return undefined;
}

export type MiMoCallMatchType =
  | Readonly<{
      kind: 'participant';
      participantTitle: string;
      demuxId: number | undefined;
    }>
  | Readonly<{ kind: 'none' }>;

/**
 * If there is an active call, map a MiMo `clientSessionId` to a participant
 * when the string equals that participant's ACI or service id (direct: peer conversation/service id).
 */
export function findMiMoCallMatch(
  activeCall: ActiveCallType | undefined,
  clientSessionId: string
): MiMoCallMatchType {
  if (!activeCall) {
    return { kind: 'none' };
  }

  if (activeCall.callMode === CallModeValue.Direct) {
    const keys = getDirectRemoteMiMoKeys(activeCall);
    if (keys.includes(clientSessionId)) {
      return {
        kind: 'participant',
        participantTitle: activeCall.conversation.title,
        demuxId: undefined,
      };
    }
    return { kind: 'none' };
  }

  const participant = activeCall.remoteParticipants.find(p =>
    getRemoteParticipantMiMoKeys(p).includes(clientSessionId)
  );
  if (participant) {
    return {
      kind: 'participant',
      participantTitle: participant.title,
      demuxId: participant.demuxId,
    };
  }

  return { kind: 'none' };
}
