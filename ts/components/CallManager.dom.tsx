// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useEffect } from 'react';
import lodash from 'lodash';
import type { AudioDevice, VideoFrameSource } from '@signalapp/ringrtc';
import { CallNeedPermissionScreen } from './CallNeedPermissionScreen.dom.tsx';
import { CallScreen } from './CallScreen.dom.tsx';
import { CallingLobby } from './CallingLobby.dom.tsx';
import { CallingParticipantsList } from './CallingParticipantsList.dom.tsx';
import { CallingSelectPresentingSourcesModal } from './CallingSelectPresentingSourcesModal.dom.tsx';
import { CallingPip } from './CallingPip.dom.tsx';
import { IncomingCallBar } from './IncomingCallBar.dom.tsx';
import type {
  ActiveCallType,
  CallViewMode,
  ChangeIODevicePayloadType,
  GroupCallConnectionState,
  GroupCallVideoRequest,
} from '../types/Calling.std.ts';
import {
  CallEndedReason,
  CallState,
  GroupCallJoinState,
} from '../types/Calling.std.ts';
import { CallMode } from '../types/CallDisposition.std.ts';
import type {
  ConversationType,
  ShowConversationType,
} from '../state/ducks/conversations.preload.ts';
import type {
  AcceptCallType,
  BatchUserActionPayloadType,
  CancelCallType,
  DeclineCallType,
  GroupCallParticipantInfoType,
  PendingUserActionPayloadType,
  SendGroupCallRaiseHandType,
  SendGroupCallReactionType,
  SetGroupCallVideoRequestType,
  SetLocalAudioType,
  SetMutedByType,
  SetLocalVideoType,
  SetRendererCanvasType,
  StartCallType,
} from '../state/ducks/calling.preload.ts';
import { CallLinkRestrictions } from '../types/CallLink.std.ts';
import type { CallLinkType } from '../types/CallLink.std.ts';
import type { LocalizerType } from '../types/Util.std.ts';
import { missingCaseError } from '../util/missingCaseError.std.ts';
import { CallingToastProvider } from './CallingToast.dom.tsx';
import type { SmartReactionPicker } from '../state/smart/ReactionPicker.dom.tsx';
import { createLogger } from '../logging/log.std.ts';
import { isGroupOrAdhocActiveCall } from '../util/isGroupOrAdhocCall.std.ts';
import { CallingAdhocCallInfo } from './CallingAdhocCallInfo.dom.tsx';
import { callLinkRootKeyToUrl } from '../util/callLinkRootKeyToUrl.std.ts';
import { usePrevious } from '../hooks/usePrevious.std.ts';
import { copyCallLink } from '../util/copyLinksWithToast.dom.ts';
import {
  redactNotificationProfileId,
  shouldNotify,
} from '../types/NotificationProfile.std.ts';
import type { NotificationProfileType } from '../types/NotificationProfile.std.ts';
import { strictAssert } from '../util/assert.std.ts';
import type { SetLocalPreviewContainerType } from '../services/calling.preload.ts';
import type { ContactModalStateType } from '../types/globalModals.std.ts';
import { TherapistConsoleModal } from './TherapistConsoleModal.dom.tsx';
import type { RemoveClientType } from '../types/Calling.std.ts';
import type { ServiceIdString } from '../types/ServiceId.std.ts';
import type { SavedMultiPartyContext } from '../types/TherapistBreakout.std.ts';

const { noop } = lodash;

const log = createLogger('CallManager');

const GROUP_CALL_RING_DURATION = 60 * 1000;

export type DirectIncomingCall = Readonly<{
  callMode: CallMode.Direct;
  callState?: CallState;
  callEndedReason?: CallEndedReason;
  conversation: ConversationType;
  isVideoCall: boolean;
}>;

export type GroupIncomingCall = Readonly<{
  callMode: CallMode.Group;
  connectionState: GroupCallConnectionState;
  joinState: GroupCallJoinState;
  conversation: ConversationType;
  otherMembersRung: Array<Pick<ConversationType, 'firstName' | 'title'>>;
  ringer: Pick<ConversationType, 'firstName' | 'title'>;
  remoteParticipants: Array<GroupCallParticipantInfoType>;
}>;

export type CallingImageDataCache = Map<number, ImageData>;

export type PropsType = {
  activeCall?: ActiveCallType;
  activeNotificationProfile: NotificationProfileType | undefined;
  addMembersToGroup: (
    conversationId: string,
    contactIds: ReadonlyArray<string>,
    callbacks?: {
      onFailure?: () => unknown;
      onSuccess?: () => unknown;
    }
  ) => void;
  availableCameras: Array<MediaDeviceInfo>;
  availableCallLinks: Array<CallLinkType>;
  availableConversations: Array<ConversationType>;
  availableMicrophones: Array<AudioDevice>;
  availableSpeakers: Array<AudioDevice>;
  callLink: CallLinkType | undefined;
  cancelCall: (_: CancelCallType) => void;
  changeCallView: (mode: CallViewMode) => void;
  changeIODevice: (payload: ChangeIODevicePayloadType) => void;
  closeNeedPermissionScreen: () => void;
  getGroupCallVideoFrameSource: (
    conversationId: string,
    demuxId: number
  ) => VideoFrameSource;
  getIsSharingPhoneNumberWithEverybody: () => boolean;
  getPresentingSources: () => void;
  isOnline: boolean;
  isTherapistConsoleVisible: boolean;
  onCreateCallLink: () => void;
  onJoinCallLink: (roomId: string) => void;
  ringingCall: DirectIncomingCall | GroupIncomingCall | null;
  renderDeviceSelection: () => React.JSX.Element;
  renderReactionPicker: (
    props: React.ComponentProps<typeof SmartReactionPicker>
  ) => React.JSX.Element;
  removeClientFromCall: (payload: RemoveClientType) => void;
  returnToActiveCall: () => void;
  sendRemoteMute: (demuxId: number) => void;
  showContactModal: (payload: ContactModalStateType) => void;
  startCall: (payload: StartCallType) => void;
  toggleParticipants: () => void;
  acceptCall: (_: AcceptCallType) => void;
  approveUser: (payload: PendingUserActionPayloadType) => void;
  batchUserAction: (payload: BatchUserActionPayloadType) => void;
  bounceAppIconStart: () => unknown;
  bounceAppIconStop: () => unknown;
  cancelPresenting: () => void;
  declineCall: (_: DeclineCallType) => void;
  denyUser: (payload: PendingUserActionPayloadType) => void;
  hasInitialLoadCompleted: boolean;
  i18n: LocalizerType;
  me: ConversationType;
  notifyForCall: (
    conversationId: string,
    title: string,
    isVideoCall: boolean
  ) => unknown;
  openSystemPreferencesAction: () => unknown;
  playRingtone: () => unknown;
  selectedCamera?: string;
  selectedMicrophone?: AudioDevice;
  selectedSpeaker?: AudioDevice;
  onStartAudioCall: (conversationId: string) => void;
  onStartVideoCall: (conversationId: string) => void;
  selectPresentingSource: (id: string) => void;
  sendGroupCallRaiseHand: (payload: SendGroupCallRaiseHandType) => void;
  sendGroupCallReaction: (payload: SendGroupCallReactionType) => void;
  setGroupCallVideoRequest: (_: SetGroupCallVideoRequestType) => void;
  setIsCallActive: (_: boolean) => void;
  setLocalAudio: SetLocalAudioType;
  setLocalVideo: SetLocalVideoType;
  setLocalAudioRemoteMuted: SetMutedByType;
  setLocalPreviewContainer: (options: SetLocalPreviewContainerType) => void;
  setOutgoingRing: (_: boolean) => void;
  setRendererCanvas: (_: SetRendererCanvasType) => void;
  showShareCallLinkViaSignal: (
    callLink: CallLinkType,
    i18n: LocalizerType
  ) => void;
  stopRingtone: () => unknown;
  switchToPresentationView: () => void;
  switchFromPresentationView: () => void;
  hangUpActiveCall: (reason: string) => void;
  togglePip: () => void;
  toggleCallLinkPendingParticipantModal: (contactId: string) => void;
  toggleScreenRecordingPermissionsDialog: () => unknown;
  toggleSelfViewExpanded: () => unknown;
  toggleSettings: () => void;
  updateCallLinkName: (roomId: string, name: string) => void;
  pauseVoiceNotePlayer: () => void;
  therapistBreakoutSavedMultiPartyContext?: SavedMultiPartyContext | null;
  therapistBreakoutBusy?: boolean;
  onTherapistBreakoutToOneToOne?: (
    directConversationId: string,
    recipientServiceId?: ServiceIdString
  ) => void;
  onTherapistRejoinSavedMultiParty?: () => void;
  showConversation: ShowConversationType;
};

type ActiveCallManagerPropsType = {
  activeCall: ActiveCallType;
} & Omit<
  PropsType,
  | 'acceptCall'
  | 'activeNotificationProfile'
  | 'bounceAppIconStart'
  | 'bounceAppIconStop'
  | 'declineCall'
  | 'hasInitialLoadCompleted'
  | 'notifyForCall'
  | 'playRingtone'
  | 'ringingCall'
  | 'setIsCallActive'
  | 'stopRingtone'
  | 'isConversationTooBigToRing'
>;

function ActiveCallManager({
  activeCall,
  addMembersToGroup,
  showConversation,
  approveUser,
  availableCameras,
  availableCallLinks,
  availableConversations,
  availableMicrophones,
  availableSpeakers,
  batchUserAction,
  callLink,
  cancelCall,
  cancelPresenting,
  changeCallView,
  changeIODevice,
  closeNeedPermissionScreen,
  denyUser,
  hangUpActiveCall,
  i18n,
  isOnline,
  getIsSharingPhoneNumberWithEverybody,
  getGroupCallVideoFrameSource,
  getPresentingSources,
  me,
  onCreateCallLink,
  onJoinCallLink,
  openSystemPreferencesAction,
  renderDeviceSelection,
  renderReactionPicker,
  removeClientFromCall,
  returnToActiveCall,
  sendRemoteMute,
  selectPresentingSource,
  sendGroupCallRaiseHand,
  sendGroupCallReaction,
  setGroupCallVideoRequest,
  setLocalAudio,
  setLocalAudioRemoteMuted,
  setLocalPreviewContainer,
  setLocalVideo,
  setRendererCanvas,
  setOutgoingRing,
  showContactModal,
  showShareCallLinkViaSignal,
  startCall,
  switchToPresentationView,
  switchFromPresentationView,
  toggleCallLinkPendingParticipantModal,
  toggleParticipants,
  togglePip,
  toggleScreenRecordingPermissionsDialog,
  toggleSelfViewExpanded,
  toggleSettings,
  pauseVoiceNotePlayer,
  selectedCamera,
  selectedMicrophone,
  selectedSpeaker,
  onStartAudioCall,
  onStartVideoCall,
  isTherapistConsoleVisible,
  updateCallLinkName,
  therapistBreakoutSavedMultiPartyContext = null,
  therapistBreakoutBusy = false,
  onTherapistBreakoutToOneToOne,
  onTherapistRejoinSavedMultiParty,
}: ActiveCallManagerPropsType): React.JSX.Element {
  const {
    conversation,
    hasLocalAudio,
    hasLocalVideo,
    peekedParticipants,
    pip,
    presentingSourcesAvailable,
    settingsDialogOpen,
    showParticipantsList,
    outgoingRing,
  } = activeCall;

  const cancelActiveCall = useCallback(() => {
    cancelCall({ conversationId: conversation.id });
  }, [cancelCall, conversation.id]);

  const joinActiveCall = useCallback(() => {
    // pause any voice note playback
    pauseVoiceNotePlayer();

    startCall({
      callMode: activeCall.callMode,
      conversationId: conversation.id,
      hasLocalAudio,
      hasLocalVideo,
    });
  }, [
    startCall,
    activeCall.callMode,
    conversation.id,
    hasLocalAudio,
    hasLocalVideo,
    pauseVoiceNotePlayer,
  ]);

  // For caching screenshare frames which update slowly, between Pip and CallScreen.
  const imageDataCache = React.useRef<CallingImageDataCache>(new Map());

  const previousConversationId = usePrevious(conversation.id, conversation.id);
  useEffect(() => {
    if (conversation.id !== previousConversationId) {
      imageDataCache.current.clear();
    }
  }, [conversation.id, previousConversationId]);

  const getGroupCallVideoFrameSourceForActiveCall = useCallback(
    (demuxId: number) => {
      return getGroupCallVideoFrameSource(conversation.id, demuxId);
    },
    [getGroupCallVideoFrameSource, conversation.id]
  );

  const setGroupCallVideoRequestForConversation = useCallback(
    (resolutions: Array<GroupCallVideoRequest>, speakerHeight: number) => {
      setGroupCallVideoRequest({
        conversationId: conversation.id,
        resolutions,
        speakerHeight,
      });
    },
    [setGroupCallVideoRequest, conversation.id]
  );

  const onCopyCallLink = useCallback(async () => {
    if (!callLink) {
      return;
    }

    const link = callLinkRootKeyToUrl(callLink.rootKey);
    if (link) {
      await copyCallLink(link);
    }
  }, [callLink]);

  const handleShareCallLinkViaSignal = useCallback(() => {
    strictAssert(callLink != null, 'Missing call link');
    showShareCallLinkViaSignal(callLink, i18n);
  }, [callLink, i18n, showShareCallLinkViaSignal]);

  const handleOpenCallControls = useCallback(() => {
    returnToActiveCall();
    // Do not hide Session Console — leaving it open keeps screen share / call flows in the console
    // instead of dropping to the default Signal call UI (see TherapistConsole.preload SmartTherapistConsole).
  }, [returnToActiveCall]);

  const handleEndCallFromTherapistConsole = useCallback(() => {
    hangUpActiveCall('therapist console end call');
  }, [hangUpActiveCall]);

  /** Close / Escape / backdrop: leave the call but stay in the therapist workspace shell (do not return to main Signal UI). */
  const handleTherapistConsoleClose = useCallback(() => {
    hangUpActiveCall('therapist console close');
  }, [hangUpActiveCall]);

  let isCallFull: boolean;
  let showCallLobby: boolean;
  let groupMembers:
    | undefined
    | Array<Pick<ConversationType, 'id' | 'firstName' | 'title'>>;
  let isConvoTooBigToRing = false;
  let isAdhocAdminApprovalRequired = false;
  let isAdhocJoinRequestPending = false;
  let isCallLinkAdmin = false;

  switch (activeCall.callMode) {
    case CallMode.Direct: {
      const { callState, callEndedReason } = activeCall;
      const ended = callState === CallState.Ended;
      if (
        ended &&
        callEndedReason === CallEndedReason.RemoteHangupNeedPermission
      ) {
        return (
          <CallNeedPermissionScreen
            close={closeNeedPermissionScreen}
            conversation={conversation}
            i18n={i18n}
          />
        );
      }
      showCallLobby = !callState;
      isCallFull = false;
      groupMembers = undefined;
      break;
    }
    case CallMode.Group:
    case CallMode.Adhoc: {
      showCallLobby = activeCall.joinState !== GroupCallJoinState.Joined;
      isCallFull = activeCall.deviceCount >= activeCall.maxDevices;
      isConvoTooBigToRing = activeCall.isConversationTooBigToRing;
      ({ groupMembers } = activeCall);
      isAdhocAdminApprovalRequired =
        !callLink?.adminKey &&
        callLink?.restrictions === CallLinkRestrictions.AdminApproval;
      isAdhocJoinRequestPending =
        isAdhocAdminApprovalRequired &&
        activeCall.joinState === GroupCallJoinState.Pending;
      isCallLinkAdmin = Boolean(callLink?.adminKey);
      break;
    }
    default:
      throw missingCaseError(activeCall);
  }

  if (isTherapistConsoleVisible) {
    return (
      <>
        <TherapistConsoleModal
          activeCall={activeCall}
          addMembersToGroup={addMembersToGroup}
          showConversation={showConversation}
          availableCameras={availableCameras}
          availableCallLinks={availableCallLinks}
          availableConversations={availableConversations}
          availableMicrophones={availableMicrophones}
          availableSpeakers={availableSpeakers}
          cancelPresenting={cancelPresenting}
          changeIODevice={changeIODevice}
          getGroupCallVideoFrameSource={getGroupCallVideoFrameSourceForActiveCall}
          getPresentingSources={getPresentingSources}
          i18n={i18n}
          onApprovePendingParticipant={serviceId => {
            approveUser({ serviceId });
          }}
          onClose={handleTherapistConsoleClose}
          onCreateCallLink={onCreateCallLink}
          onDenyPendingParticipant={serviceId => {
            denyUser({ serviceId });
          }}
          onEndCall={handleEndCallFromTherapistConsole}
          onJoinCallLink={onJoinCallLink}
          onOpenCallControls={handleOpenCallControls}
          onRemoteMute={sendRemoteMute}
          onRemoveParticipant={demuxId => {
            removeClientFromCall({ demuxId });
          }}
          onToggleAudio={() => {
            setLocalAudio({ enabled: !activeCall.hasLocalAudio });
          }}
          onToggleVideo={() => {
            setLocalVideo({ enabled: !activeCall.hasLocalVideo });
          }}
          openSystemPreferencesAction={openSystemPreferencesAction}
          onUpdateCallLinkName={updateCallLinkName}
          selectedCamera={selectedCamera}
          selectedMicrophone={selectedMicrophone}
          selectedSpeaker={selectedSpeaker}
          onStartAudioCall={onStartAudioCall}
          onStartVideoCall={onStartVideoCall}
          setGroupCallVideoRequest={setGroupCallVideoRequestForConversation}
          setLocalPreviewContainer={setLocalPreviewContainer}
          setRendererCanvas={setRendererCanvas}
          showShareCallLinkViaSignal={showShareCallLinkViaSignal}
          startCall={startCall}
          savedMultiPartyContext={therapistBreakoutSavedMultiPartyContext}
          breakoutBusy={therapistBreakoutBusy}
          onBreakoutToOneToOne={onTherapistBreakoutToOneToOne}
          onRejoinSavedMultiParty={onTherapistRejoinSavedMultiParty}
          toggleScreenRecordingPermissionsDialog={
            toggleScreenRecordingPermissionsDialog
          }
        />
        {presentingSourcesAvailable && presentingSourcesAvailable.length ? (
          <CallingSelectPresentingSourcesModal
            i18n={i18n}
            presentingSourcesAvailable={presentingSourcesAvailable}
            selectPresentingSource={selectPresentingSource}
            cancelPresenting={cancelPresenting}
          />
        ) : null}
      </>
    );
  }

  if (pip) {
    return (
      <CallingPip
        activeCall={activeCall}
        getGroupCallVideoFrameSource={getGroupCallVideoFrameSourceForActiveCall}
        imageDataCache={imageDataCache}
        hangUpActiveCall={hangUpActiveCall}
        i18n={i18n}
        me={me}
        setGroupCallVideoRequest={setGroupCallVideoRequestForConversation}
        setLocalPreviewContainer={setLocalPreviewContainer}
        setRendererCanvas={setRendererCanvas}
        switchToPresentationView={switchToPresentationView}
        switchFromPresentationView={switchFromPresentationView}
        toggleAudio={setLocalAudio}
        togglePip={togglePip}
        toggleVideo={() => {
          const enabled = !activeCall.hasLocalVideo;
          setLocalVideo({ enabled });
        }}
      />
    );
  }

  if (showCallLobby) {
    return (
      <>
        <CallingLobby
          availableCameras={availableCameras}
          callMode={activeCall.callMode}
          conversation={conversation}
          groupMembers={groupMembers}
          hasLocalAudio={hasLocalAudio}
          hasLocalVideo={hasLocalVideo}
          i18n={i18n}
          isAdhocAdminApprovalRequired={isAdhocAdminApprovalRequired}
          isAdhocJoinRequestPending={isAdhocJoinRequestPending}
          isCallFull={isCallFull}
          isConversationTooBigToRing={isConvoTooBigToRing}
          isOnline={isOnline}
          getIsSharingPhoneNumberWithEverybody={
            getIsSharingPhoneNumberWithEverybody
          }
          me={me}
          onCallCanceled={cancelActiveCall}
          onJoinCall={joinActiveCall}
          outgoingRing={outgoingRing}
          peekedParticipants={peekedParticipants}
          setLocalPreviewContainer={setLocalPreviewContainer}
          setLocalAudio={setLocalAudio}
          setLocalVideo={setLocalVideo}
          setOutgoingRing={setOutgoingRing}
          showParticipantsList={showParticipantsList}
          toggleParticipants={toggleParticipants}
          togglePip={togglePip}
          toggleSettings={toggleSettings}
        />
        {settingsDialogOpen && renderDeviceSelection()}
        {showParticipantsList &&
          (activeCall.callMode === CallMode.Adhoc && callLink ? (
            <CallingAdhocCallInfo
              callLink={callLink}
              i18n={i18n}
              isUnknownContactDiscrete={false}
              ourServiceId={me.serviceId}
              participants={peekedParticipants}
              onClose={toggleParticipants}
              onCopyCallLink={onCopyCallLink}
              onShareCallLinkViaSignal={handleShareCallLinkViaSignal}
              showContactModal={showContactModal}
            />
          ) : (
            <CallingParticipantsList
              conversationId={conversation.id}
              i18n={i18n}
              onClose={toggleParticipants}
              ourServiceId={me.serviceId}
              participants={peekedParticipants}
              showContactModal={showContactModal}
            />
          ))}
      </>
    );
  }

  let isHandRaised = false;
  if (isGroupOrAdhocActiveCall(activeCall)) {
    const { raisedHands, localDemuxId } = activeCall;
    if (localDemuxId) {
      isHandRaised = raisedHands.has(localDemuxId);
    }
  }

  const groupCallParticipantsForParticipantsList = isGroupOrAdhocActiveCall(
    activeCall
  )
    ? [
        ...activeCall.remoteParticipants,
        {
          ...me,
          hasRemoteAudio: hasLocalAudio,
          hasRemoteVideo: hasLocalVideo,
          isHandRaised,
          presenting: Boolean(activeCall.presentingSource),
          demuxId: activeCall.localDemuxId,
        },
      ]
    : [];

  return (
    <>
      <CallScreen
        activeCall={activeCall}
        approveUser={approveUser}
        batchUserAction={batchUserAction}
        cancelPresenting={cancelPresenting}
        changeCallView={changeCallView}
        denyUser={denyUser}
        getPresentingSources={getPresentingSources}
        getGroupCallVideoFrameSource={getGroupCallVideoFrameSourceForActiveCall}
        groupMembers={groupMembers}
        hangUpActiveCall={hangUpActiveCall}
        i18n={i18n}
        imageDataCache={imageDataCache}
        isCallLinkAdmin={isCallLinkAdmin}
        me={me}
        openSystemPreferencesAction={openSystemPreferencesAction}
        renderReactionPicker={renderReactionPicker}
        sendGroupCallRaiseHand={sendGroupCallRaiseHand}
        sendGroupCallReaction={sendGroupCallReaction}
        setGroupCallVideoRequest={setGroupCallVideoRequestForConversation}
        setLocalPreviewContainer={setLocalPreviewContainer}
        setRendererCanvas={setRendererCanvas}
        setLocalAudio={setLocalAudio}
        setLocalAudioRemoteMuted={setLocalAudioRemoteMuted}
        setLocalVideo={setLocalVideo}
        stickyControls={showParticipantsList}
        switchToPresentationView={switchToPresentationView}
        switchFromPresentationView={switchFromPresentationView}
        toggleCallLinkPendingParticipantModal={
          toggleCallLinkPendingParticipantModal
        }
        toggleScreenRecordingPermissionsDialog={
          toggleScreenRecordingPermissionsDialog
        }
        toggleParticipants={toggleParticipants}
        togglePip={togglePip}
        toggleSelfViewExpanded={toggleSelfViewExpanded}
        toggleSettings={toggleSettings}
      />
      {presentingSourcesAvailable && presentingSourcesAvailable.length ? (
        <CallingSelectPresentingSourcesModal
          i18n={i18n}
          presentingSourcesAvailable={presentingSourcesAvailable}
          selectPresentingSource={selectPresentingSource}
          cancelPresenting={cancelPresenting}
        />
      ) : null}
      {settingsDialogOpen && renderDeviceSelection()}
      {showParticipantsList &&
        (activeCall.callMode === CallMode.Adhoc && callLink ? (
          <CallingAdhocCallInfo
            callLink={callLink}
            i18n={i18n}
            isUnknownContactDiscrete
            ourServiceId={me.serviceId}
            participants={groupCallParticipantsForParticipantsList}
            onClose={toggleParticipants}
            onCopyCallLink={onCopyCallLink}
            onShareCallLinkViaSignal={handleShareCallLinkViaSignal}
            showContactModal={showContactModal}
          />
        ) : (
          <CallingParticipantsList
            conversationId={conversation.id}
            i18n={i18n}
            onClose={toggleParticipants}
            ourServiceId={me.serviceId}
            participants={groupCallParticipantsForParticipantsList}
            showContactModal={showContactModal}
          />
        ))}
    </>
  );
}

export function CallManager({
  acceptCall,
  activeCall,
  activeNotificationProfile,
  addMembersToGroup,
  approveUser,
  availableCameras,
  availableCallLinks,
  availableConversations,
  availableMicrophones,
  availableSpeakers,
  batchUserAction,
  bounceAppIconStart,
  bounceAppIconStop,
  callLink,
  cancelCall,
  cancelPresenting,
  changeCallView,
  changeIODevice,
  closeNeedPermissionScreen,
  declineCall,
  denyUser,
  getGroupCallVideoFrameSource,
  getPresentingSources,
  hangUpActiveCall,
  hasInitialLoadCompleted,
  i18n,
  isOnline,
  isTherapistConsoleVisible,
  getIsSharingPhoneNumberWithEverybody,
  me,
  notifyForCall,
  onCreateCallLink,
  onJoinCallLink,
  openSystemPreferencesAction,
  pauseVoiceNotePlayer,
  playRingtone,
  renderDeviceSelection,
  renderReactionPicker,
  removeClientFromCall,
  ringingCall,
  returnToActiveCall,
  sendRemoteMute,
  selectedCamera,
  selectedMicrophone,
  selectedSpeaker,
  onStartAudioCall,
  onStartVideoCall,
  selectPresentingSource,
  sendGroupCallRaiseHand,
  sendGroupCallReaction,
  setGroupCallVideoRequest,
  setIsCallActive,
  setLocalAudio,
  setLocalAudioRemoteMuted,
  setLocalPreviewContainer,
  setLocalVideo,
  setOutgoingRing,
  setRendererCanvas,
  showContactModal,
  showShareCallLinkViaSignal,
  startCall,
  stopRingtone,
  switchFromPresentationView,
  switchToPresentationView,
  toggleParticipants,
  togglePip,
  toggleCallLinkPendingParticipantModal,
  toggleScreenRecordingPermissionsDialog,
  toggleSelfViewExpanded,
  toggleSettings,
  updateCallLinkName,
  therapistBreakoutSavedMultiPartyContext = null,
  therapistBreakoutBusy = false,
  onTherapistBreakoutToOneToOne,
  onTherapistRejoinSavedMultiParty,
  showConversation,
}: PropsType): React.JSX.Element | null {
  const isCallActive = Boolean(activeCall);
  useEffect(() => {
    setIsCallActive(isCallActive);
  }, [isCallActive, setIsCallActive]);

  // It's important not to use the ringingCall itself, because that changes
  const ringingCallId = ringingCall?.conversation.id;
  useEffect(() => {
    if (hasInitialLoadCompleted && ringingCallId) {
      if (
        !shouldNotify({
          activeProfile: activeNotificationProfile,
          conversationId: ringingCallId,
          isCall: true,
          isMentionOrReply: false,
        })
      ) {
        const redactedId = redactNotificationProfileId(
          activeNotificationProfile?.id ?? ''
        );
        log.info(
          `Would play ringtone, but notification profile ${redactedId} prevented it`
        );
        return;
      }

      log.info('Playing ringtone');
      playRingtone();

      return () => {
        log.info('Stopping ringtone');
        stopRingtone();
      };
    }

    stopRingtone();
    return noop;
  }, [
    activeNotificationProfile,
    hasInitialLoadCompleted,
    playRingtone,
    ringingCallId,
    stopRingtone,
  ]);

  const mightBeRingingOutgoingGroupCall =
    isGroupOrAdhocActiveCall(activeCall) &&
    activeCall.outgoingRing &&
    activeCall.joinState !== GroupCallJoinState.NotJoined;
  useEffect(() => {
    if (!mightBeRingingOutgoingGroupCall) {
      return noop;
    }

    const timeout = setTimeout(() => {
      setOutgoingRing(false);
    }, GROUP_CALL_RING_DURATION);
    return () => {
      clearTimeout(timeout);
    };
  }, [mightBeRingingOutgoingGroupCall, setOutgoingRing]);

  if (activeCall) {
    // `props` should logically have an `activeCall` at this point, but TypeScript can't
    //   figure that out, so we pass it in again.
    return (
      <CallingToastProvider i18n={i18n}>
        <ActiveCallManager
          activeCall={activeCall}
          addMembersToGroup={addMembersToGroup}
          showConversation={showConversation}
          availableCameras={availableCameras}
          availableCallLinks={availableCallLinks}
          availableConversations={availableConversations}
          availableMicrophones={availableMicrophones}
          availableSpeakers={availableSpeakers}
          approveUser={approveUser}
          batchUserAction={batchUserAction}
          callLink={callLink}
          cancelCall={cancelCall}
          cancelPresenting={cancelPresenting}
          changeCallView={changeCallView}
          changeIODevice={changeIODevice}
          closeNeedPermissionScreen={closeNeedPermissionScreen}
          denyUser={denyUser}
          getGroupCallVideoFrameSource={getGroupCallVideoFrameSource}
          getPresentingSources={getPresentingSources}
          hangUpActiveCall={hangUpActiveCall}
          i18n={i18n}
          isOnline={isOnline}
          isTherapistConsoleVisible={isTherapistConsoleVisible}
          getIsSharingPhoneNumberWithEverybody={
            getIsSharingPhoneNumberWithEverybody
          }
          me={me}
          onCreateCallLink={onCreateCallLink}
          onJoinCallLink={onJoinCallLink}
          openSystemPreferencesAction={openSystemPreferencesAction}
          pauseVoiceNotePlayer={pauseVoiceNotePlayer}
          renderDeviceSelection={renderDeviceSelection}
          renderReactionPicker={renderReactionPicker}
          removeClientFromCall={removeClientFromCall}
          returnToActiveCall={returnToActiveCall}
          sendRemoteMute={sendRemoteMute}
          selectedCamera={selectedCamera}
          selectedMicrophone={selectedMicrophone}
          selectedSpeaker={selectedSpeaker}
          onStartAudioCall={onStartAudioCall}
          onStartVideoCall={onStartVideoCall}
          selectPresentingSource={selectPresentingSource}
          sendGroupCallRaiseHand={sendGroupCallRaiseHand}
          sendGroupCallReaction={sendGroupCallReaction}
          setGroupCallVideoRequest={setGroupCallVideoRequest}
          setLocalAudio={setLocalAudio}
          setLocalAudioRemoteMuted={setLocalAudioRemoteMuted}
          setLocalPreviewContainer={setLocalPreviewContainer}
          setLocalVideo={setLocalVideo}
          setOutgoingRing={setOutgoingRing}
          setRendererCanvas={setRendererCanvas}
          showContactModal={showContactModal}
          showShareCallLinkViaSignal={showShareCallLinkViaSignal}
          startCall={startCall}
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
          therapistBreakoutSavedMultiPartyContext={
            therapistBreakoutSavedMultiPartyContext
          }
          therapistBreakoutBusy={therapistBreakoutBusy}
          onTherapistBreakoutToOneToOne={onTherapistBreakoutToOneToOne}
          onTherapistRejoinSavedMultiParty={onTherapistRejoinSavedMultiParty}
        />
      </CallingToastProvider>
    );
  }

  // In the future, we may want to show the incoming call bar when a call is active.
  if (ringingCall) {
    if (
      !shouldNotify({
        isCall: true,
        isMentionOrReply: false,
        conversationId: ringingCall.conversation.id,
        activeProfile: activeNotificationProfile,
      })
    ) {
      const redactedId = redactNotificationProfileId(
        activeNotificationProfile?.id ?? ''
      );
      log.info(
        `Would show incoming call bar, but notification profile ${redactedId} prevented it`
      );
      return null;
    }

    return (
      <IncomingCallBar
        acceptCall={acceptCall}
        bounceAppIconStart={bounceAppIconStart}
        bounceAppIconStop={bounceAppIconStop}
        declineCall={declineCall}
        i18n={i18n}
        notifyForCall={notifyForCall}
        {...ringingCall}
      />
    );
  }

  return null;
}
