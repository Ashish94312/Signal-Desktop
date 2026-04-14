// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Client-side breakout coordinator.
 *
 * When the therapist sends a `breakout_direct_invite` the client needs to:
 *   1. Leave the current group / call-link session.
 *   2. Answer the incoming direct call from the therapist.
 *   3. Automatically rejoin the original multi-party session when the 1:1 ends.
 *
 * This module is a stateful singleton that subscribes to the Redux store and
 * drives the state machine through its stages.
 */

import { createLogger } from '../logging/log.std.ts';
import type { StateType as RootStateType } from '../state/reducer.preload.ts';
import { CallMode } from '../types/CallDisposition.std.ts';

const log = createLogger('mimoBreakoutCoordinator');

type SavedMultiPartyContextType =
  | Readonly<{
      kind: 'conversation';
      conversationId: string;
      hasLocalAudio: boolean;
      hasLocalVideo: boolean;
    }>
  | Readonly<{
      kind: 'callLink';
      roomId: string;
      rootKey: string;
      adminKey?: string;
      hasLocalAudio: boolean;
      hasLocalVideo: boolean;
    }>;

type BreakoutFlowStateType = {
  therapistAci?: string;
  savedMultiPartyContext?: SavedMultiPartyContextType;
  directConversationId?: string;
  stage: 'waitingForDirect' | 'ringingDirect' | 'inDirect' | 'rejoining';
};

let breakoutFlowState: BreakoutFlowStateType | undefined;
let unsubscribeStore: (() => void) | undefined;
let processing = false;
let needsRerun = false;

export function handleBreakoutDirectInvite(options: {
  senderAci?: string;
  pausedSessionTitle?: string | null;
}): void {
  const { pausedSessionTitle, senderAci } = options;

  log.info(
    `mimo: breakout_direct_invite received from ${senderAci ?? 'unknown'}` +
      (pausedSessionTitle ? ` (paused: ${pausedSessionTitle})` : '')
  );

  ensureStoreSubscription();

  const state = window.reduxStore?.getState();
  if (!state) {
    log.warn('handleBreakoutDirectInvite: redux store is not ready');
    return;
  }

  breakoutFlowState = {
    therapistAci: senderAci,
    savedMultiPartyContext: getSavedMultiPartyContext(state),
    stage: 'waitingForDirect',
  };

  const activeCallState = state.calling.activeCallState;
  if (
    activeCallState?.state === 'Active' &&
    (activeCallState.callMode === CallMode.Group ||
      activeCallState.callMode === CallMode.Adhoc)
  ) {
    log.info(
      `handleBreakoutDirectInvite: leaving ${activeCallState.callMode} call before breakout`
    );
    window.reduxActions?.calling?.hangUpActiveCall(
      'mimo breakout_direct_invite received'
    );
  }

  scheduleProcessing();
}

function ensureStoreSubscription(): void {
  if (unsubscribeStore || !window.reduxStore) {
    return;
  }

  unsubscribeStore = window.reduxStore.subscribe(() => {
    if (!breakoutFlowState) {
      return;
    }
    scheduleProcessing();
  });
}

function scheduleProcessing(): void {
  if (processing) {
    needsRerun = true;
    return;
  }

  processing = true;
  void (async () => {
    try {
      do {
        needsRerun = false;
        await processBreakoutFlow();
      } while (needsRerun);
    } finally {
      processing = false;
    }
  })();
}

async function processBreakoutFlow(): Promise<void> {
  const state = window.reduxStore?.getState();
  const flow = breakoutFlowState;
  if (!state || !flow) {
    return;
  }

  switch (flow.stage) {
    case 'waitingForDirect': {
      const incomingDirectCall = getMatchingIncomingDirectCall(
        state,
        flow.therapistAci
      );
      if (!incomingDirectCall) {
        return;
      }

      breakoutFlowState = {
        ...flow,
        directConversationId: incomingDirectCall.conversationId,
        stage: 'ringingDirect',
      };
      log.info(
        `processBreakoutFlow: breakout direct call ringing for conversation ${incomingDirectCall.conversationId}`
      );
      return;
    }

    case 'ringingDirect':
      if (isActiveDirectCall(state, flow.directConversationId)) {
        breakoutFlowState = { ...flow, stage: 'inDirect' };
        log.info('processBreakoutFlow: now in 1:1 direct call');
        return;
      }

      if (isWaitingDirectCall(state, flow.directConversationId)) {
        // Still ringing — wait
        return;
      }

      if (state.calling.activeCallState) {
        log.info(
          'processBreakoutFlow: another call became active while breakout call was ringing; clearing'
        );
        breakoutFlowState = undefined;
        return;
      }

      // The direct call was declined or missed; attempt to rejoin group anyway
      log.info(
        'processBreakoutFlow: breakout direct call missed/declined; attempting to rejoin group'
      );
      breakoutFlowState = { ...flow, stage: 'rejoining' };
      await autoRejoinSavedMultiParty(flow.savedMultiPartyContext);
      breakoutFlowState = undefined;
      return;

    case 'inDirect':
      if (isActiveDirectCall(state, flow.directConversationId)) {
        // Still in the 1:1 — wait
        return;
      }

      if (state.calling.activeCallState) {
        log.info(
          'processBreakoutFlow: another call became active before auto-rejoin; clearing'
        );
        breakoutFlowState = undefined;
        return;
      }

      // 1:1 ended — auto-rejoin the group
      log.info(
        'processBreakoutFlow: 1:1 ended, auto-rejoining multi-party session'
      );
      breakoutFlowState = { ...flow, stage: 'rejoining' };
      await autoRejoinSavedMultiParty(flow.savedMultiPartyContext);
      breakoutFlowState = undefined;
      return;

    case 'rejoining':
      // In progress — nothing to do
      return;

    default:
      return;
  }
}

function getSavedMultiPartyContext(
  state: RootStateType
): SavedMultiPartyContextType | undefined {
  const activeCallState = state.calling.activeCallState;
  if (!activeCallState || activeCallState.state !== 'Active') {
    return;
  }

  if (activeCallState.callMode === CallMode.Group) {
    return {
      kind: 'conversation',
      conversationId: activeCallState.conversationId,
      hasLocalAudio: activeCallState.hasLocalAudio,
      hasLocalVideo: activeCallState.hasLocalVideo,
    };
  }

  if (activeCallState.callMode === CallMode.Adhoc) {
    const callLink = state.calling.callLinks[activeCallState.conversationId];
    if (!callLink) {
      log.warn(
        `getSavedMultiPartyContext: missing call link for ${activeCallState.conversationId}`
      );
      return;
    }

    return {
      kind: 'callLink',
      roomId: activeCallState.conversationId,
      rootKey: callLink.rootKey,
      adminKey: callLink.adminKey ?? undefined,
      hasLocalAudio: activeCallState.hasLocalAudio,
      hasLocalVideo: activeCallState.hasLocalVideo,
    };
  }

  return;
}

function getMatchingIncomingDirectCall(
  state: RootStateType,
  therapistAci: string | undefined
):
  | undefined
  | Readonly<{
      conversationId: string;
      isVideoCall: boolean;
    }> {
  const activeCallState = state.calling.activeCallState;
  if (!activeCallState || activeCallState.state !== 'Waiting') {
    return;
  }

  const call =
    state.calling.callsByConversation[activeCallState.conversationId];
  if (!call || call.callMode !== CallMode.Direct || !call.isIncoming) {
    return;
  }

  if (therapistAci) {
    const serviceId = window.ConversationController.get(
      activeCallState.conversationId
    )?.getServiceId();
    if (serviceId !== therapistAci) {
      return;
    }
  }

  return {
    conversationId: activeCallState.conversationId,
    isVideoCall: call.isVideoCall,
  };
}

function isActiveDirectCall(
  state: RootStateType,
  conversationId: string | undefined
): boolean {
  return Boolean(
    conversationId &&
      state.calling.activeCallState?.state === 'Active' &&
      state.calling.activeCallState.callMode === CallMode.Direct &&
      state.calling.activeCallState.conversationId === conversationId
  );
}

function isWaitingDirectCall(
  state: RootStateType,
  conversationId: string | undefined
): boolean {
  return Boolean(
    conversationId &&
      state.calling.activeCallState?.state === 'Waiting' &&
      state.calling.activeCallState.conversationId === conversationId &&
      state.calling.callsByConversation[conversationId]?.callMode ===
        CallMode.Direct &&
      state.calling.callsByConversation[conversationId]?.isIncoming
  );
}

async function autoRejoinSavedMultiParty(
  savedMultiPartyContext: SavedMultiPartyContextType | undefined
): Promise<void> {
  if (!savedMultiPartyContext) {
    log.info('autoRejoinSavedMultiParty: no saved context; nothing to rejoin');
    return;
  }

  if (window.reduxStore?.getState().calling.activeCallState) {
    log.warn(
      'autoRejoinSavedMultiParty: active call already present; skipping rejoin'
    );
    return;
  }

  try {
    if (savedMultiPartyContext.kind === 'conversation') {
      log.info(
        `autoRejoinSavedMultiParty: rejoining group conversation ${savedMultiPartyContext.conversationId}`
      );
      await window.reduxActions?.calling?.startCallingLobby({
        conversationId: savedMultiPartyContext.conversationId,
        isVideoCall: savedMultiPartyContext.hasLocalVideo,
        autoJoinAfterLobby: true,
      });
      return;
    }

    log.info(
      `autoRejoinSavedMultiParty: rejoining call-link room ${savedMultiPartyContext.roomId}`
    );
    const callLink =
      window.reduxStore?.getState().calling.callLinks[
        savedMultiPartyContext.roomId
      ];
    if (callLink) {
      await window.reduxActions?.calling?.startCallLinkLobbyByRoomId({
        roomId: savedMultiPartyContext.roomId,
        autoJoinAfterLobby: true,
      });
    } else {
      await window.reduxActions?.calling?.startCallLinkLobby({
        rootKey: savedMultiPartyContext.rootKey,
      });
    }
  } catch (error) {
    log.error(
      'autoRejoinSavedMultiParty: failed',
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    );
  }
}
