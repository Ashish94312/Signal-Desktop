// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { memo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { TherapistConsoleModal } from '../../components/TherapistConsoleModal.dom.tsx';
import { getIntl } from '../selectors/user.std.ts';
import { mapStateToActiveCallProp } from './mapStateToActiveCallProp.preload.tsx';
import { calling as callingService } from '../../services/calling.preload.ts';
import { useCallingActions } from '../ducks/calling.preload.ts';
import { useGlobalModalActions } from '../ducks/globalModals.preload.ts';
import { CallMode } from '../../types/CallDisposition.std.ts';
import type { GroupCallVideoRequest } from '../../types/Calling.std.ts';
import type { ServiceIdString } from '../../types/ServiceId.std.ts';
import {
  getAvailableCameras,
  getAllCallLinks,
  getAvailableMicrophones,
  getAvailableSpeakers,
  getSelectedCamera,
  getSelectedMicrophone,
  getSelectedSpeaker,
} from '../selectors/calling.std.ts';
import {
  getAllConversations,
} from '../selectors/conversations.dom.ts';
import { useConversationsActions } from '../ducks/conversations.preload.ts';
import { useTherapistBreakoutOptional } from './TherapistBreakoutProvider.preload.tsx';

const getGroupCallVideoFrameSource =
  callingService.getGroupCallVideoFrameSource.bind(callingService);
const setLocalPreviewContainer =
  callingService.setLocalPreviewContainer.bind(callingService);

export const SmartTherapistConsole = memo(function SmartTherapistConsole() {
  const therapistBreakout = useTherapistBreakoutOptional();

  const activeCall = useSelector(mapStateToActiveCallProp);
  const availableCameras = useSelector(getAvailableCameras);
  const availableCallLinks = useSelector(getAllCallLinks);
  const availableConversations = useSelector(getAllConversations);
  const availableMicrophones = useSelector(getAvailableMicrophones);
  const availableSpeakers = useSelector(getAvailableSpeakers);
  const i18n = useSelector(getIntl);
  const selectedCamera = useSelector(getSelectedCamera);
  const selectedMicrophone = useSelector(getSelectedMicrophone);
  const selectedSpeaker = useSelector(getSelectedSpeaker);

  const { addMembersToGroup, showConversation } = useConversationsActions();
  const { hideTherapistConsole, showShareCallLinkViaSignal } = useGlobalModalActions();
  const {
    approveUser,
    cancelPresenting,
    changeIODevice,
    createCallLink,
    denyUser,
    getPresentingSources,
    hangUpActiveCall,
    onOutgoingAudioCallInConversation,
    onOutgoingVideoCallInConversation,
    openSystemPreferencesAction,
    removeClient,
    returnToActiveCall,
    sendRemoteMute,
    setGroupCallVideoRequest,
    setLocalAudio,
    setLocalVideo,
    setRendererCanvas,
    startCall,
    startCallLinkLobbyByRoomId,
    toggleScreenRecordingPermissionsDialog,
    updateCallLinkName,
  } = useCallingActions();

  const handleSetGroupCallVideoRequest = useCallback(
    (
      resolutions: Array<GroupCallVideoRequest>,
      speakerHeight: number
    ) => {
      if (
        !activeCall ||
        (activeCall.callMode !== CallMode.Group &&
          activeCall.callMode !== CallMode.Adhoc)
      ) {
        return;
      }

      setGroupCallVideoRequest({
        conversationId: activeCall.conversation.id,
        resolutions,
        speakerHeight,
      });
    },
    [activeCall, setGroupCallVideoRequest]
  );

  const handleGetGroupCallVideoFrameSource = useCallback(
    (demuxId: number) => {
      if (
        !activeCall ||
        (activeCall.callMode !== CallMode.Group &&
          activeCall.callMode !== CallMode.Adhoc)
      ) {
        throw new Error(
          'TherapistConsole: group video source requested without an active group call'
        );
      }

      return getGroupCallVideoFrameSource(activeCall.conversation.id, demuxId);
    },
    [activeCall]
  );

  const handleToggleAudio = useCallback(() => {
    if (!activeCall) {
      return;
    }

    setLocalAudio({ enabled: !activeCall.hasLocalAudio });
  }, [activeCall, setLocalAudio]);

  const handleToggleVideo = useCallback(() => {
    if (!activeCall) {
      return;
    }

    setLocalVideo({ enabled: !activeCall.hasLocalVideo });
  }, [activeCall, setLocalVideo]);

  const handleOpenCallControls = useCallback(() => {
    returnToActiveCall();
    // Keep Session Console open; use the console’s Devices tab for media settings when needed.
  }, [returnToActiveCall]);

  const handleEndCall = useCallback(() => {
    hangUpActiveCall('therapist console end call');
  }, [hangUpActiveCall]);

  const handleClose = useCallback(() => {
    if (activeCall) {
      hangUpActiveCall('therapist console close');
      return;
    }
    hideTherapistConsole();
  }, [activeCall, hangUpActiveCall, hideTherapistConsole]);

  const handleApprovePendingParticipant = useCallback(
    (serviceId: ServiceIdString | undefined) => {
      approveUser({ serviceId });
    },
    [approveUser]
  );

  const handleDenyPendingParticipant = useCallback(
    (serviceId: ServiceIdString | undefined) => {
      denyUser({ serviceId });
    },
    [denyUser]
  );

  const handleRemoteMute = useCallback(
    (demuxId: number) => {
      sendRemoteMute(demuxId);
    },
    [sendRemoteMute]
  );

  const handleRemoveParticipant = useCallback(
    (demuxId: number) => {
      removeClient({ demuxId });
    },
    [removeClient]
  );

  const handleCreateCallLink = useCallback(() => {
    createCallLink(_roomId => {
      // Stay in the console — the new link will appear in availableCallLinks
    });
  }, [createCallLink]);

  const handleStartAudioCall = useCallback(
    (conversationId: string) => {
      onOutgoingAudioCallInConversation(conversationId);
      // Stay in the console — activeCall will become non-null and the UI transitions
    },
    [onOutgoingAudioCallInConversation]
  );

  const handleStartVideoCall = useCallback(
    (conversationId: string) => {
      onOutgoingVideoCallInConversation(conversationId);
    },
    [onOutgoingVideoCallInConversation]
  );

  const handleJoinCallLink = useCallback(
    (roomId: string) => {
      startCallLinkLobbyByRoomId({ roomId });
    },
    [startCallLinkLobbyByRoomId]
  );

  const handleUpdateCallLinkName = useCallback(
    (roomId: string, name: string) => {
      updateCallLinkName(roomId, name);
    },
    [updateCallLinkName]
  );

  return (
    <TherapistConsoleModal
      activeCall={activeCall}
      addMembersToGroup={addMembersToGroup}
      breakoutBusy={therapistBreakout?.breakoutBusy ?? false}
      availableCameras={availableCameras}
      availableCallLinks={availableCallLinks}
      availableConversations={availableConversations}
      availableMicrophones={availableMicrophones}
      availableSpeakers={availableSpeakers}
      changeIODevice={changeIODevice}
      getGroupCallVideoFrameSource={handleGetGroupCallVideoFrameSource}
      i18n={i18n}
      onApprovePendingParticipant={handleApprovePendingParticipant}
      onClose={handleClose}
      onCreateCallLink={handleCreateCallLink}
      onDenyPendingParticipant={handleDenyPendingParticipant}
      onEndCall={handleEndCall}
      onJoinCallLink={handleJoinCallLink}
      onBreakoutToOneToOne={therapistBreakout?.handleBreakoutToOneToOne}
      onOpenCallControls={handleOpenCallControls}
      onRejoinSavedMultiParty={therapistBreakout?.handleRejoinSavedMultiParty}
      onRemoteMute={handleRemoteMute}
      onRemoveParticipant={handleRemoveParticipant}
      onStartAudioCall={handleStartAudioCall}
      onStartVideoCall={handleStartVideoCall}
      onToggleAudio={handleToggleAudio}
      onToggleVideo={handleToggleVideo}
      cancelPresenting={cancelPresenting}
      getPresentingSources={getPresentingSources}
      openSystemPreferencesAction={openSystemPreferencesAction}
      onUpdateCallLinkName={handleUpdateCallLinkName}
      selectedCamera={selectedCamera}
      selectedMicrophone={selectedMicrophone}
      selectedSpeaker={selectedSpeaker}
      setGroupCallVideoRequest={handleSetGroupCallVideoRequest}
      setLocalPreviewContainer={setLocalPreviewContainer}
      setRendererCanvas={setRendererCanvas}
      savedMultiPartyContext={therapistBreakout?.savedMultiPartyContext ?? null}
      showConversation={showConversation}
      showShareCallLinkViaSignal={showShareCallLinkViaSignal}
      startCall={startCall}
      toggleScreenRecordingPermissionsDialog={
        toggleScreenRecordingPermissionsDialog
      }
    />
  );
});
