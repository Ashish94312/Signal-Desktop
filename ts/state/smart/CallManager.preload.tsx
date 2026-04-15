// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { memo, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import type {
  DirectIncomingCall,
  GroupIncomingCall,
} from '../../components/CallManager.dom.tsx';
import { CallManager } from '../../components/CallManager.dom.tsx';
import { isConversationTooBigToRing as getIsConversationTooBigToRing } from '../../conversations/isConversationTooBigToRing.dom.ts';
import { createLogger } from '../../logging/log.std.ts';
import { calling as callingService } from '../../services/calling.preload.ts';
import type { SetLocalPreviewContainerType } from '../../services/calling.preload.ts';
import {
  bounceAppIconStart,
  bounceAppIconStop,
} from '../../shims/bounceAppIcon.preload.ts';
import type { CallLinkType } from '../../types/CallLink.std.ts';
import { CallMode } from '../../types/CallDisposition.std.ts';
import { callingTones } from '../../util/callingTones.preload.ts';
import { missingCaseError } from '../../util/missingCaseError.std.ts';
import { useAudioPlayerActions } from '../ducks/audioPlayer.preload.ts';
import { useConversationsActions } from '../ducks/conversations.preload.ts';
import { getActiveCall, useCallingActions } from '../ducks/calling.preload.ts';
import { useNavActions } from '../ducks/nav.std.ts';
import type { StateType } from '../reducer.preload.ts';
import { getHasInitialLoadCompleted } from '../selectors/app.std.ts';
import {
  getAllCallLinks,
  getAvailableMicrophones,
  getAvailableCameras,
  getAvailableSpeakers,
  getCallLinkSelector,
  getRingingCall,
  getSelectedCamera,
  getSelectedMicrophone,
  getSelectedSpeaker,
} from '../selectors/calling.std.ts';
import {
  getAllConversations,
  getConversationSelector,
  getMe,
} from '../selectors/conversations.dom.ts';
import { getIntl, getUserACI } from '../selectors/user.std.ts';
import { SmartCallingDeviceSelection } from './CallingDeviceSelection.preload.tsx';
import { renderReactionPicker } from './renderReactionPicker.dom.tsx';
import { isSharingPhoneNumberWithEverybody as getIsSharingPhoneNumberWithEverybody } from '../../util/phoneNumberSharingMode.preload.ts';
import { useGlobalModalActions } from '../ducks/globalModals.preload.ts';
import { isLonelyGroup } from '../ducks/callingHelpers.std.ts';
import { getActiveProfile } from '../selectors/notificationProfiles.dom.ts';
import { isOnline as isWebAPIOnline } from '../../textsecure/WebAPI.preload.ts';
import {
  getIsTherapistConsoleVisible,
} from '../selectors/globalModals.std.ts';
import { useTherapistBreakoutOptional } from './TherapistBreakoutProvider.preload.tsx';
import { mapStateToActiveCallProp } from './mapStateToActiveCallProp.preload.tsx';
import { NavTab } from '../../types/Nav.std.ts';

export { mapStateToActiveCallProp };

const log = createLogger('CallManager');

function renderDeviceSelection(): React.JSX.Element {
  return <SmartCallingDeviceSelection />;
}

const getGroupCallVideoFrameSource =
  callingService.getGroupCallVideoFrameSource.bind(callingService);

const notifyForCall = callingService.notifyForCall.bind(callingService);

function setLocalPreviewContainer(options: SetLocalPreviewContainerType): void {
  callingService.setLocalPreviewContainer(options);
}

const playRingtone = callingTones.playRingtone.bind(callingTones);
const stopRingtone = callingTones.stopRingtone.bind(callingTones);

const mapStateToCallLinkProp = (state: StateType): CallLinkType | undefined => {
  const { calling } = state;
  const { activeCallState } = calling;

  if (!activeCallState) {
    return;
  }

  const call = getActiveCall(calling);
  if (call?.callMode !== CallMode.Adhoc) {
    return;
  }

  const callLinkSelector = getCallLinkSelector(state);
  const callLink = callLinkSelector(activeCallState.conversationId);
  if (!callLink) {
    log.error(
      'Active call referred to a call link but no corresponding call link in state.'
    );
    return;
  }

  return callLink;
};

const mapStateToRingingCallProp = (
  state: StateType
): DirectIncomingCall | GroupIncomingCall | null => {
  const ourAci = getUserACI(state);
  const ringingCall = getRingingCall(state);
  if (!ringingCall) {
    return null;
  }

  const conversation = getConversationSelector(state)(
    ringingCall.conversationId
  );
  if (!conversation) {
    log.error('The incoming call has no corresponding conversation');
    return null;
  }

  switch (ringingCall.callMode) {
    case CallMode.Direct:
      return {
        callMode: CallMode.Direct as const,
        callState: ringingCall.callState,
        callEndedReason: ringingCall.callEndedReason,
        conversation,
        isVideoCall: ringingCall.isVideoCall,
      };
    case CallMode.Group: {
      if (getIsConversationTooBigToRing(conversation)) {
        return null;
      }

      if (isLonelyGroup(conversation)) {
        return null;
      }

      const conversationSelector = getConversationSelector(state);
      const ringer = conversationSelector(ringingCall.ringerAci || ourAci);
      const otherMembersRung = (conversation.sortedGroupMembers ?? []).filter(
        c => c.id !== ringer.id && !c.isMe
      );

      return {
        callMode: CallMode.Group as const,
        connectionState: ringingCall.connectionState,
        joinState: ringingCall.joinState,
        conversation,
        otherMembersRung,
        ringer,
        remoteParticipants: ringingCall.remoteParticipants,
      };
    }
    case CallMode.Adhoc:
      log.error('Cannot handle an incoming adhoc call');
      return null;
    default:
      throw missingCaseError(ringingCall);
  }
};

export const SmartCallManager = memo(function SmartCallManager() {
  const i18n = useSelector(getIntl);
  const activeCall = useSelector(mapStateToActiveCallProp);
  const callLink = useSelector(mapStateToCallLinkProp);
  const ringingCall = useSelector(mapStateToRingingCallProp);
  const availableCallLinks = useSelector(getAllCallLinks);
  const availableCameras = useSelector(getAvailableCameras);
  const availableConversations = useSelector(getAllConversations);
  const availableMicrophones = useSelector(getAvailableMicrophones);
  const availableSpeakers = useSelector(getAvailableSpeakers);
  const hasInitialLoadCompleted = useSelector(getHasInitialLoadCompleted);
  const me = useSelector(getMe);
  const activeNotificationProfile = useSelector(getActiveProfile);
  const isTherapistConsoleVisible = useSelector(getIsTherapistConsoleVisible);
  const therapistBreakout = useTherapistBreakoutOptional();
  const selectedCamera = useSelector(getSelectedCamera);
  const selectedMicrophone = useSelector(getSelectedMicrophone);
  const selectedSpeaker = useSelector(getSelectedSpeaker);

  const [isOnline, setIsOnline] = useState(isWebAPIOnline() ?? false);

  useEffect(() => {
    const update = () => {
      setIsOnline(isWebAPIOnline() ?? false);
    };

    update();

    window.Whisper.events.on('online', update);
    window.Whisper.events.on('offline', update);

    return () => {
      window.Whisper.events.off('online', update);
      window.Whisper.events.off('offline', update);
    };
  }, []);

  const { changeLocation } = useNavActions();
  const {
    approveUser,
    batchUserAction,
    createCallLink,
    denyUser,
    changeCallView,
    changeIODevice,
    closeNeedPermissionScreen,
    getPresentingSources,
    cancelCall,
    startCall,
    toggleParticipants,
    acceptCall,
    declineCall,
    openSystemPreferencesAction,
    onOutgoingAudioCallInConversation,
    onOutgoingVideoCallInConversation,
    cancelPresenting,
    sendGroupCallRaiseHand,
    sendGroupCallReaction,
    selectPresentingSource,
    setGroupCallVideoRequest,
    setIsCallActive,
    setLocalAudio,
    setLocalAudioRemoteMuted,
    setLocalVideo,
    setOutgoingRing,
    returnToActiveCall,
    removeClient,
    sendRemoteMute,
    setRendererCanvas,
    startCallLinkLobbyByRoomId,
    switchToPresentationView,
    switchFromPresentationView,
    hangUpActiveCall,
    togglePip,
    toggleScreenRecordingPermissionsDialog,
    toggleSelfViewExpanded,
    toggleSettings,
    updateCallLinkName,
  } = useCallingActions();
  const { pauseVoiceNotePlayer } = useAudioPlayerActions();
  const { addMembersToGroup, showConversation } = useConversationsActions();
  const {
    showContactModal,
    hideTherapistConsole,
    showShareCallLinkViaSignal,
    toggleCallLinkEditModal,
    toggleCallLinkPendingParticipantModal,
  } = useGlobalModalActions();

  const handleCreateCallLink = React.useCallback(() => {
    createCallLink(roomId => {
      toggleCallLinkEditModal(roomId);
      changeLocation({ tab: NavTab.Calls });
      hideTherapistConsole();
    });
  }, [
    changeLocation,
    createCallLink,
    hideTherapistConsole,
    toggleCallLinkEditModal,
  ]);

  const handleStartAudioCall = React.useCallback(
    (conversationId: string) => {
      onOutgoingAudioCallInConversation(conversationId);
      // Keep Session Console visible — same as SmartTherapistConsole (see TherapistConsole.preload).
    },
    [onOutgoingAudioCallInConversation]
  );

  const handleStartVideoCall = React.useCallback(
    (conversationId: string) => {
      onOutgoingVideoCallInConversation(conversationId);
      // Keep Session Console visible for direct and group calls.
    },
    [onOutgoingVideoCallInConversation]
  );

  const handleJoinCallLink = React.useCallback(
    (roomId: string) => {
      startCallLinkLobbyByRoomId({ roomId });
      // Keep Session Console visible while joining a call link.
    },
    [startCallLinkLobbyByRoomId]
  );

  return (
    <CallManager
      acceptCall={acceptCall}
      activeCall={activeCall}
      activeNotificationProfile={activeNotificationProfile}
      addMembersToGroup={addMembersToGroup}
      approveUser={approveUser}
      availableCameras={availableCameras}
      availableCallLinks={availableCallLinks}
      availableConversations={availableConversations}
      availableMicrophones={availableMicrophones}
      availableSpeakers={availableSpeakers}
      batchUserAction={batchUserAction}
      bounceAppIconStart={bounceAppIconStart}
      bounceAppIconStop={bounceAppIconStop}
      callLink={callLink}
      cancelCall={cancelCall}
      cancelPresenting={cancelPresenting}
      changeCallView={changeCallView}
      changeIODevice={changeIODevice}
      closeNeedPermissionScreen={closeNeedPermissionScreen}
      declineCall={declineCall}
      denyUser={denyUser}
      getGroupCallVideoFrameSource={getGroupCallVideoFrameSource}
      getIsSharingPhoneNumberWithEverybody={
        getIsSharingPhoneNumberWithEverybody
      }
      getPresentingSources={getPresentingSources}
      hangUpActiveCall={hangUpActiveCall}
      hasInitialLoadCompleted={hasInitialLoadCompleted}
      i18n={i18n}
      isTherapistConsoleVisible={isTherapistConsoleVisible}
      therapistBreakoutSavedMultiPartyContext={
        therapistBreakout?.savedMultiPartyContext ?? null
      }
      therapistBreakoutBusy={therapistBreakout?.breakoutBusy ?? false}
      onTherapistBreakoutToOneToOne={therapistBreakout?.handleBreakoutToOneToOne}
      onTherapistRejoinSavedMultiParty={
        therapistBreakout?.handleRejoinSavedMultiParty
      }
      isOnline={isOnline}
      me={me}
      notifyForCall={notifyForCall}
      onCreateCallLink={handleCreateCallLink}
      onJoinCallLink={handleJoinCallLink}
      onStartAudioCall={handleStartAudioCall}
      onStartVideoCall={handleStartVideoCall}
      openSystemPreferencesAction={openSystemPreferencesAction}
      pauseVoiceNotePlayer={pauseVoiceNotePlayer}
      playRingtone={playRingtone}
      renderDeviceSelection={renderDeviceSelection}
      renderReactionPicker={renderReactionPicker}
      removeClientFromCall={removeClient}
      ringingCall={ringingCall}
      returnToActiveCall={returnToActiveCall}
      sendRemoteMute={sendRemoteMute}
      showConversation={showConversation}
      selectedCamera={selectedCamera}
      selectedMicrophone={selectedMicrophone}
      selectedSpeaker={selectedSpeaker}
      sendGroupCallRaiseHand={sendGroupCallRaiseHand}
      sendGroupCallReaction={sendGroupCallReaction}
      selectPresentingSource={selectPresentingSource}
      setGroupCallVideoRequest={setGroupCallVideoRequest}
      setIsCallActive={setIsCallActive}
      setLocalAudio={setLocalAudio}
      setLocalAudioRemoteMuted={setLocalAudioRemoteMuted}
      setLocalPreviewContainer={setLocalPreviewContainer}
      setLocalVideo={setLocalVideo}
      setOutgoingRing={setOutgoingRing}
      setRendererCanvas={setRendererCanvas}
      showContactModal={showContactModal}
      showShareCallLinkViaSignal={showShareCallLinkViaSignal}
      startCall={startCall}
      stopRingtone={stopRingtone}
      switchFromPresentationView={switchFromPresentationView}
      switchToPresentationView={switchToPresentationView}
      toggleCallLinkPendingParticipantModal={
        toggleCallLinkPendingParticipantModal
      }
      toggleParticipants={toggleParticipants}
      togglePip={togglePip}
      toggleScreenRecordingPermissionsDialog={
        toggleScreenRecordingPermissionsDialog
      }
      toggleSelfViewExpanded={toggleSelfViewExpanded}
      toggleSettings={toggleSettings}
      updateCallLinkName={updateCallLinkName}
    />
  );
});
