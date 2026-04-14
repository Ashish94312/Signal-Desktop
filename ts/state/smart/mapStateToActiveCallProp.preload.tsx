// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import lodash from 'lodash';
import { isConversationTooBigToRing as getIsConversationTooBigToRing } from '../../conversations/isConversationTooBigToRing.dom.ts';
import { createLogger } from '../../logging/log.std.ts';
import type {
  ActiveCallBaseType,
  ActiveCallType,
  ActiveDirectCallType,
  ActiveGroupCallType,
  CallingConversationType,
  ConversationsByDemuxIdType,
  GroupCallRemoteParticipantType,
} from '../../types/Calling.std.ts';
import { CallState } from '../../types/Calling.std.ts';
import { CallMode } from '../../types/CallDisposition.std.ts';
import type { AciString } from '../../types/ServiceId.std.ts';
import { callLinkToConversation } from '../../util/callLinks.std.ts';
import { missingCaseError } from '../../util/missingCaseError.std.ts';
import { getActiveCall } from '../ducks/calling.preload.ts';
import type { ConversationType } from '../ducks/conversations.preload.ts';
import type { StateType } from '../reducer.preload.ts';
import {
  getActiveCallState,
  getCallLinkSelector,
} from '../selectors/calling.std.ts';
import {
  getConversationSelector,
  getMe,
} from '../selectors/conversations.dom.ts';

const { memoize } = lodash;

const log = createLogger('mapStateToActiveCallProp');

export const mapStateToActiveCallProp = (
  state: StateType
): undefined | ActiveCallType => {
  const { calling } = state;
  const activeCallState = getActiveCallState(state);

  if (!activeCallState) {
    return undefined;
  }

  const call = getActiveCall(calling);
  if (!call) {
    log.error('There was an active call state but no corresponding call');
    return undefined;
  }

  const conversationSelector = getConversationSelector(state);
  let conversation: CallingConversationType;
  if (call.callMode === CallMode.Adhoc) {
    const callLinkSelector = getCallLinkSelector(state);
    const callLink = callLinkSelector(activeCallState.conversationId);
    if (!callLink) {
      return undefined;
    }

    conversation = callLinkToConversation(callLink, window.SignalContext.i18n);
  } else {
    conversation = conversationSelector(activeCallState.conversationId);
  }
  if (!conversation) {
    log.error('The active call has no corresponding conversation');
    return undefined;
  }

  const conversationSelectorByAci = memoize<
    (aci: AciString) => undefined | ConversationType
  >(aci => {
    const convoForAci = window.ConversationController.lookupOrCreate({
      serviceId: aci,
      reason: 'mapStateToActiveCallProp',
    });
    return convoForAci ? conversationSelector(convoForAci.id) : undefined;
  });

  const baseResult: ActiveCallBaseType = {
    conversation,
    hasLocalAudio: activeCallState.hasLocalAudio,
    hasLocalVideo: activeCallState.hasLocalVideo,
    localAudioLevel: activeCallState.localAudioLevel,
    viewMode: activeCallState.viewMode,
    viewModeBeforePresentation: activeCallState.viewModeBeforePresentation,
    joinedAt: activeCallState.joinedAt,
    outgoingRing: activeCallState.outgoingRing,
    pip: activeCallState.pip,
    presentingSource: activeCallState.presentingSource,
    presentingSourcesAvailable: activeCallState.presentingSourcesAvailable,
    settingsDialogOpen: activeCallState.settingsDialogOpen,
    selfViewExpanded: activeCallState.selfViewExpanded,
    showNeedsScreenRecordingPermissionsWarning: Boolean(
      activeCallState.showNeedsScreenRecordingPermissionsWarning
    ),
    showParticipantsList: activeCallState.showParticipantsList,
    reactions: activeCallState.reactions,
  };

  switch (call.callMode) {
    case CallMode.Direct:
      if (
        call.isIncoming &&
        (call.callState === CallState.Prering ||
          call.callState === CallState.Ringing)
      ) {
        return;
      }

      return {
        ...baseResult,
        callEndedReason: call.callEndedReason,
        callMode: CallMode.Direct,
        callState: call.callState,
        peekedParticipants: [],
        remoteAudioLevel: call.remoteAudioLevel,
        hasRemoteAudio: Boolean(call.hasRemoteAudio),
        hasRemoteVideo: Boolean(call.hasRemoteVideo),
        remoteParticipants: [
          {
            hasRemoteVideo: Boolean(call.hasRemoteVideo),
            presenting: Boolean(call.isSharingScreen),
            title: conversation.title,
            serviceId: conversation.serviceId,
          },
        ],
      } satisfies ActiveDirectCallType;
    case CallMode.Group:
    case CallMode.Adhoc: {
      const groupMembers: Array<ConversationType> = [];
      const remoteParticipants: Array<GroupCallRemoteParticipantType> = [];
      const peekedParticipants: Array<ConversationType> = [];
      const pendingParticipants: Array<ConversationType> = [];
      const conversationsByDemuxId: ConversationsByDemuxIdType = new Map();
      const { localDemuxId } = call;
      const raisedHands: Set<number> = new Set(call.raisedHands ?? []);

      const { memberships = [] } = conversation;

      const {
        peekInfo = {
          deviceCount: 0,
          maxDevices: Infinity,
          acis: [],
          pendingAcis: [],
        },
      } = call;

      for (const membership of memberships) {
        const { aci } = membership;

        const member = conversationSelector(aci);
        if (!member) {
          log.error('Group member has no corresponding conversation');
          continue;
        }

        groupMembers.push(member);
      }

      for (const remoteParticipant of call.remoteParticipants) {
        const remoteConversation = conversationSelectorByAci(
          remoteParticipant.aci
        );
        if (!remoteConversation) {
          log.error('Remote participant has no corresponding conversation');
          continue;
        }

        remoteParticipants.push({
          ...remoteConversation,
          aci: remoteParticipant.aci,
          addedTime: remoteParticipant.addedTime,
          demuxId: remoteParticipant.demuxId,
          hasRemoteAudio: remoteParticipant.hasRemoteAudio,
          hasRemoteVideo: remoteParticipant.hasRemoteVideo,
          isHandRaised: raisedHands.has(remoteParticipant.demuxId),
          mediaKeysReceived: remoteParticipant.mediaKeysReceived,
          presenting: remoteParticipant.presenting,
          sharingScreen: remoteParticipant.sharingScreen,
          speakerTime: remoteParticipant.speakerTime,
          videoAspectRatio: remoteParticipant.videoAspectRatio,
        });
        conversationsByDemuxId.set(
          remoteParticipant.demuxId,
          remoteConversation
        );
      }

      if (localDemuxId !== undefined) {
        conversationsByDemuxId.set(localDemuxId, getMe(state));
      }

      raisedHands.forEach(demuxId => {
        if (!conversationsByDemuxId.has(demuxId)) {
          raisedHands.delete(demuxId);
        }
      });

      for (const peekedParticipantAci of peekInfo.acis) {
        const peekedConversation =
          conversationSelectorByAci(peekedParticipantAci);
        if (!peekedConversation) {
          log.error('Remote participant has no corresponding conversation');
          continue;
        }

        peekedParticipants.push(peekedConversation);
      }

      for (const aci of peekInfo.pendingAcis) {
        const pendingConversation = conversationSelectorByAci(aci);
        if (!pendingConversation) {
          log.error('Pending participant has no corresponding conversation');
          continue;
        }

        pendingParticipants.push(pendingConversation);
      }

      return {
        ...baseResult,
        callMode: call.callMode,
        connectionState: call.connectionState,
        conversationsByDemuxId,
        deviceCount: peekInfo.deviceCount,
        groupMembers,
        isConversationTooBigToRing: getIsConversationTooBigToRing(conversation),
        joinState: call.joinState,
        localDemuxId,
        maxDevices: peekInfo.maxDevices,
        peekedParticipants,
        pendingParticipants,
        raisedHands,
        remoteParticipants,
        remoteAudioLevels: call.remoteAudioLevels || new Map<number, number>(),
        suggestLowerHand: Boolean(activeCallState.suggestLowerHand),
        mutedBy: activeCallState.mutedBy,
        observedRemoteMute: activeCallState.observedRemoteMute,
      } satisfies ActiveGroupCallType;
    }
    default:
      throw missingCaseError(call);
  }
};
