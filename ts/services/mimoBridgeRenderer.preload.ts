// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Renderer-side MiMo bridge service (preload context).
 *
 * Watches the Redux calling state and pushes serialized events to the
 * main process (which forwards them to the @mimo/client child process).
 *
 * Also handles call commands received from the main process:
 *   mimo:bridge-join-call       → acceptCall / startCallingLobby
 *   mimo:bridge-leave-call      → hangUpActiveCall
 *   mimo:bridge-get-our-aci     → reply with local ACI
 *   mimo:bridge-get-conversation→ reply with conversation info
 *   mimo:bridge-get-screen-sources → reply with desktop sources list
 */

import { ipcRenderer as ipc, desktopCapturer } from 'electron';

import { createLogger } from '../logging/log.std.ts';
import { drop } from '../util/drop.std.ts';
import { getOwn } from '../util/getOwn.std.ts';
import {
  CallState,
  GroupCallConnectionState,
  GroupCallJoinState,
} from '../types/Calling.std.ts';
import { CallMode } from '../types/CallDisposition.std.ts';
import type {
  DirectCallStateType,
  GroupCallStateType,
} from '../state/ducks/calling.preload.ts';
import { itemStorage } from '../textsecure/Storage.preload.ts';

const log = createLogger('mimoBridgeRenderer');

// ── IPC channel names (mirror app/mimo_child_bridge.main.ts) ───────────────
const R_CALL_STATE        = 'mimo:bridge-call-state';
const R_JOIN_CALL         = 'mimo:bridge-join-call';
const R_LEAVE_CALL        = 'mimo:bridge-leave-call';
const R_GET_OUR_ACI       = 'mimo:bridge-get-our-aci';
const R_GET_OUR_ACI_RESP  = 'mimo:bridge-get-our-aci:response';
const R_GET_CONV          = 'mimo:bridge-get-conversation';
const R_GET_CONV_RESP     = 'mimo:bridge-get-conversation:response';
const R_GET_SOURCES       = 'mimo:bridge-get-screen-sources';
const R_GET_SOURCES_RESP  = 'mimo:bridge-get-screen-sources:response';

// ── Bridge call-state event shape (matches MiMoBridgeCallStateChangedEvent) ─

type BridgeParticipant = {
  demuxId: number;
  aci: string;
  hasVideo: boolean;
  isSelf: boolean;
};

type BridgeCallState = {
  conversationId: string;
  callLinkRoomId?: string;
  isActive: boolean;
  isJoined: boolean;
  participants: Array<BridgeParticipant>;
};

const IDLE_STATE: BridgeCallState = {
  conversationId: '',
  isActive: false,
  isJoined: false,
  participants: [],
};

// ── State serializers ────────────────────────────────────────────────────────

function serializeDirectCall(call: DirectCallStateType): BridgeCallState {
  const { callState } = call;
  const isActive =
    callState !== undefined &&
    callState !== CallState.Ended &&
    callState !== CallState.Prering;
  const isJoined =
    callState === CallState.Accepted || callState === CallState.Reconnecting;

  return {
    conversationId: call.conversationId,
    isActive,
    isJoined,
    // Direct calls have no per-participant demuxId in Signal's state; the
    // bridge consumer uses isJoined + conversationId, so an empty array is fine.
    participants: [],
  };
}

function serializeGroupCall(
  call: GroupCallStateType,
  ourAci: string | undefined
): BridgeCallState {
  const isActive =
    call.connectionState !== GroupCallConnectionState.NotConnected;
  const isJoined = call.joinState === GroupCallJoinState.Joined;

  const remoteParticipants: Array<BridgeParticipant> =
    call.remoteParticipants.map(p => ({
      demuxId: p.demuxId,
      aci: String(p.aci),
      hasVideo: p.hasRemoteVideo,
      isSelf: false,
    }));

  const participants: Array<BridgeParticipant> =
    isJoined && ourAci
      ? [
          {
            demuxId: call.localDemuxId ?? 0,
            aci: ourAci,
            hasVideo: false,
            isSelf: true,
          },
          ...remoteParticipants,
        ]
      : remoteParticipants;

  return {
    conversationId: call.conversationId,
    isActive,
    isJoined,
    participants,
  };
}

function getCurrentBridgeState(): BridgeCallState {
  const store = window.reduxStore;
  if (!store) {
    return IDLE_STATE;
  }

  const callingState = store.getState().calling;
  const { activeCallState } = callingState;

  if (!activeCallState || activeCallState.state !== 'Active') {
    return IDLE_STATE;
  }

  const { conversationId, callMode } = activeCallState;
  const ourAci: string | undefined = itemStorage.user.getAci() ?? undefined;

  if (callMode === CallMode.Adhoc) {
    const adhocCall = getOwn(callingState.adhocCalls, conversationId);
    if (!adhocCall) {
      return { ...IDLE_STATE, conversationId };
    }
    return serializeGroupCall(adhocCall, ourAci);
  }

  const call = getOwn(callingState.callsByConversation, conversationId);
  if (!call) {
    return { ...IDLE_STATE, conversationId };
  }

  if (call.callMode === CallMode.Direct) {
    return serializeDirectCall(call);
  }

  if (call.callMode === CallMode.Group) {
    return serializeGroupCall(call as GroupCallStateType, ourAci);
  }

  return IDLE_STATE;
}

// ── Command handlers (main → renderer) ──────────────────────────────────────

function handleJoinCall(params: unknown): void {
  if (!params || typeof params !== 'object') {
    return;
  }
  const p = params as Record<string, unknown>;
  const { conversationId, hasLocalVideo } = p;
  if (typeof conversationId !== 'string') {
    return;
  }

  const run = () => {
    if (!window.reduxActions?.calling?.startCallingLobby) {
      setTimeout(run, 50);
      return;
    }
    log.info('mimo bridge: dispatching startCallingLobby for', conversationId);
    window.reduxActions.calling.startCallingLobby({
      conversationId,
      isVideoCall: Boolean(hasLocalVideo),
      autoPlaceOutgoingDirectCall: true,
    });
  };
  run();
}

function handleLeaveCall(): void {
  const run = () => {
    if (!window.reduxActions?.calling?.hangUpActiveCall) {
      setTimeout(run, 50);
      return;
    }
    log.info('mimo bridge: dispatching hangUpActiveCall');
    window.reduxActions.calling.hangUpActiveCall('mimo bridge leave-call');
  };
  run();
}

// ── Initialization ───────────────────────────────────────────────────────────

let initialized = false;

export function initMimoBridgeRenderer(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  // ── Inbound command handlers ─────────────────────────────────────────────

  ipc.on(R_JOIN_CALL, (_event, params: unknown) => {
    log.info('mimo bridge: received join-call command');
    handleJoinCall(params);
  });

  ipc.on(R_LEAVE_CALL, () => {
    log.info('mimo bridge: received leave-call command');
    handleLeaveCall();
  });

  ipc.on(R_GET_OUR_ACI, () => {
    const aci = itemStorage.user.getAci() ?? null;
    ipc.send(R_GET_OUR_ACI_RESP, aci ? String(aci) : null);
  });

  ipc.on(R_GET_CONV, (_event, params: unknown) => {
    const serviceId =
      params && typeof params === 'object' && 'serviceId' in params
        ? (params as Record<string, unknown>).serviceId
        : undefined;

    if (typeof serviceId !== 'string' || !serviceId) {
      ipc.send(R_GET_CONV_RESP, null);
      return;
    }

    const conv = window.ConversationController?.get(serviceId);
    if (!conv) {
      ipc.send(R_GET_CONV_RESP, null);
      return;
    }

    ipc.send(R_GET_CONV_RESP, {
      id: conv.id,
      serviceId: conv.getServiceId() ?? undefined,
      name: conv.get('name') ?? conv.get('profileName') ?? undefined,
      isGroup: conv.get('type') !== 'private',
    });
  });

  ipc.on(R_GET_SOURCES, () => {
    drop(
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then(sources => {
          ipc.send(
            R_GET_SOURCES_RESP,
            sources.map(s => ({
              id: s.id,
              name: s.name,
              thumbnailDataUrl: s.thumbnail.toDataURL(),
            }))
          );
        })
        .catch(err => {
          log.warn('mimo bridge: failed to get screen sources', String(err));
          ipc.send(R_GET_SOURCES_RESP, []);
        })
    );
  });

  // ── Outbound: Redux calling state → main process → child ────────────────
  // Wait for window.reduxStore to be available (set during initializeRedux).

  const trySubscribe = () => {
    if (!window.reduxStore) {
      setTimeout(trySubscribe, 100);
      return;
    }

    let lastSentJson = '';

    const sendState = () => {
      const payload = getCurrentBridgeState();
      const json = JSON.stringify(payload);
      if (json === lastSentJson) {
        return; // no change — skip the IPC round-trip
      }
      lastSentJson = json;
      ipc.send(R_CALL_STATE, payload);
    };

    // Push current state immediately, then on every Redux change.
    sendState();
    window.reduxStore.subscribe(sendState);

    log.info('mimo bridge: renderer subscribed to Redux calling state');
  };

  trySubscribe();
}
