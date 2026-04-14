// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { AudioDevice, VideoFrameSource } from '@signalapp/ringrtc';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { ModalContainer } from './ModalContainer.dom.tsx';
import { DirectCallRemoteParticipant } from './DirectCallRemoteParticipant.dom.tsx';
import type { CallingImageDataCache } from './CallManager.dom.tsx';
import type {
  ActiveCallType,
  ChangeIODevicePayloadType,
  GroupCallConnectionState,
  GroupCallJoinState,
} from '../types/Calling.std.ts';
import { CallState } from '../types/Calling.std.ts';
import type { GroupCallVideoRequest } from '../types/Calling.std.ts';
import { GroupCallConnectionState as GroupConnectionState } from '../types/Calling.std.ts';
import { GroupCallJoinState as GroupJoinState } from '../types/Calling.std.ts';
import type { CallLinkType } from '../types/CallLink.std.ts';
import { CallingDeviceType } from '../types/Calling.std.ts';
import type { ServiceIdString } from '../types/ServiceId.std.ts';
import type { MiMoClientSnapshotType } from '../types/MiMoMetadata.std.ts';
import type { LocalizerType } from '../types/Util.std.ts';
import type {
  SetLocalAudioType,
  SetLocalVideoType,
  SetRendererCanvasType,
  StartCallType,
} from '../state/ducks/calling.preload.ts';
import type { SizeCallbackType } from '../calling/VideoSupport.preload.ts';
import type { CallMode } from '../types/CallDisposition.std.ts';
import { CallMode as CallModeValue } from '../types/CallDisposition.std.ts';
import type { SetLocalPreviewContainerType } from '../services/calling.preload.ts';
import type {
  ConversationType,
  ShowConversationType,
} from '../state/ducks/conversations.preload.ts';
import type { StateType } from '../state/reducer.preload.ts';
import {
  findMiMoCallMatch,
  findMiMoSnapshotForDirectCall,
  findMiMoSnapshotForGroupParticipant,
  findMiMoSnapshotForSessionTile,
  getActiveCallMiMoClientSessionIdSet,
} from '../util/mimoSessionCorrelation.std.ts';
import {
  getWorstMiMoAlertSeverity,
  miMoAlertsToConsoleCues,
} from '../util/mimoAlertTriage.std.ts';
import type { SavedMultiPartyContext } from '../types/TherapistBreakout.std.ts';
import { isGroupOrAdhocCallMode } from '../util/isGroupOrAdhocCall.std.ts';
import { copyCallLink } from '../util/copyLinksWithToast.dom.ts';
import { callLinkRootKeyToUrl } from '../util/callLinkRootKeyToUrl.std.ts';
import { getGroupMemberships } from '../util/getGroupMemberships.dom.ts';
import {
  getGroupSizeHardLimit,
  getGroupSizeRecommendedLimit,
} from '../groups/limits.dom.ts';
import { getConversationByServiceIdSelector } from '../state/selectors/conversations.dom.ts';
import type { SmartChooseGroupMembersModalPropsType } from '../state/smart/ChooseGroupMembersModal.preload.tsx';
import { SmartChooseGroupMembersModal } from '../state/smart/ChooseGroupMembersModal.preload.tsx';
import type { SmartConfirmAdditionsModalPropsType } from '../state/smart/ConfirmAdditionsModal.dom.tsx';
import { SmartConfirmAdditionsModal } from '../state/smart/ConfirmAdditionsModal.dom.tsx';
import { AddGroupMembersModal } from './conversation/conversation-details/AddGroupMembersModal.dom.tsx';
import { RequestState } from './conversation/conversation-details/util.std.ts';
import { TherapistNewGroupWizard } from './TherapistNewGroupWizard.dom.tsx';
import {
  TherapistSpotlightStage,
  TherapistVideoTileGrid,
} from './TherapistVideoTileGrid.dom.tsx';
import type { TherapistMonitoringQualityMode } from './TherapistVideoTileGrid.dom.tsx';
import { SmartTimeline } from '../state/smart/Timeline.preload.tsx';
import { SmartCompositionArea } from '../state/smart/CompositionArea.preload.tsx';
import {
  CS,
  ICONS,
  csActiveCallStage,
  csAside,
  csBackdrop,
  csCard,
  csCardNested,
  csCallControlBar,
  csCallControlButton,
  csCloseButton,
  csConversationRow,
  csDisplayMuted,
  csFormSelect,
  csHeader,
  csHeaderEyebrow,
  csHeaderTitle,
  csLobbyJoinButton,
  csLobbyOverlay,
  csLobbySubtitle,
  csLobbyTitle,
  csMainColumn,
  csMetricTile,
  csMiMoPanel,
  csNavTabIcon,
  csPrimaryButton,
  csSecondaryButton,
  csSectionLabel,
  csShellPanel,
  csShellTab,
  csStatusDot,
  csAvatar,
  csBadge,
  csVideoWell,
  csWorkspaceTitle,
  csSpotlightContainer,
  csSpotlightMain,
  csBannerWarning,
  csBannerInfo,
  csPushToTalkButton,
  getAvatarColor,
  getInitials,
} from './therapistConsoleClinicalSerenity.std.ts';
import {
  sendRemoteControlRequest,
  sendRemoteRelease,
} from '../services/mimoMessageSender.preload.ts';

// Below `$z-index-modal-host` (102) in stylesheets/_variables.scss so `ModalHost`
// portaled to `document.body` (choose members, add members, group metadata) stacks
// above this shell.
const THERAPIST_CONSOLE_SHELL_Z_INDEX = 101;

const noopSizeCallback: SizeCallbackType = () => undefined;

const renderChooseGroupMembersModalForTherapistConsole = (
  props: SmartChooseGroupMembersModalPropsType
) => <SmartChooseGroupMembersModal {...props} />;

const renderConfirmAdditionsModalForTherapistConsole = (
  props: SmartConfirmAdditionsModalPropsType
) => <SmartConfirmAdditionsModal {...props} />;

// ---------------------------------------------------------------------------
// Inline SVG icon component
// ---------------------------------------------------------------------------

function Icon({
  svg,
  size = 16,
  color,
  style,
}: {
  svg: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        color: color ?? 'currentColor',
        flexShrink: 0,
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ---------------------------------------------------------------------------
// Inline avatar with initials
// ---------------------------------------------------------------------------

function AvatarCircle({
  name,
  size = 32,
  style,
}: {
  name: string;
  size?: number;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const { bg, fg } = getAvatarColor(name);
  return (
    <div
      style={{
        ...csAvatar(size),
        background: bg,
        color: fg,
        ...style,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PropsType = {
  activeCall: ActiveCallType | undefined;
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
  changeIODevice: (payload: ChangeIODevicePayloadType) => void;
  getGroupCallVideoFrameSource: (demuxId: number) => VideoFrameSource;
  i18n: LocalizerType;
  onApprovePendingParticipant: (serviceId: ServiceIdString | undefined) => void;
  /** Leave group/call-link and open direct 1:1 lobby (SmartTherapistConsole only). */
  onBreakoutToOneToOne?: (
    directConversationId: string,
    recipientServiceId?: ServiceIdString
  ) => void;
  onClose: () => void;
  onCreateCallLink: () => void;
  onDenyPendingParticipant: (serviceId: ServiceIdString | undefined) => void;
  onEndCall: () => void;
  onJoinCallLink: (roomId: string) => void;
  onOpenCallControls: () => void;
  /** Rejoin GV2 group or call-link saved from a prior breakout. */
  onRejoinSavedMultiParty?: () => void;
  onRemoteMute: (demuxId: number) => void;
  onRemoveParticipant: (demuxId: number) => void;
  onStartAudioCall: (conversationId: string) => void;
  onStartVideoCall: (conversationId: string) => void;
  incomingDirectCall?: IncomingDirectCallPrompt;
  onAcceptIncomingCall?: (conversationId: string, asVideoCall: boolean) => void;
  onDeclineIncomingCall?: (conversationId: string) => void;
  onToggleAudio: () => void;
  onUpdateCallLinkName: (roomId: string, name: string) => void;
  onToggleVideo: () => void;
  /** Used to mute group media when entering Focus Mode and restore on exit. */
  setLocalAudio: SetLocalAudioType;
  setLocalVideo: SetLocalVideoType;
  cancelPresenting: () => void;
  selectedCamera: string | undefined;
  selectedMicrophone: AudioDevice | undefined;
  selectedSpeaker: AudioDevice | undefined;
  setGroupCallVideoRequest: (
    resolutions: Array<GroupCallVideoRequest>,
    speakerHeight: number
  ) => void;
  setLocalPreviewContainer: (options: SetLocalPreviewContainerType) => void;
  setRendererCanvas: (_: SetRendererCanvasType) => void;
  showShareCallLinkViaSignal: (
    callLink: CallLinkType,
    i18n: LocalizerType
  ) => void;
  startCall: (payload: StartCallType) => void;
  /** Saved room to offer “Rejoin” after breakout to direct 1:1. */
  savedMultiPartyContext?: SavedMultiPartyContext | null;
  breakoutBusy?: boolean;
  /** Syncs global chat selection so timeline loads and SmartTimeline renders (Session Console Messages tab). */
  showConversation: ShowConversationType;
};

type CueTone = 'good' | 'info' | 'warning' | 'critical';

type ConsoleCue = {
  detail: string;
  label: string;
  tone: CueTone;
};

type ConsoleSession = {
  cues: Array<ConsoleCue>;
  id: string;
  rows: Array<readonly [label: string, value: string]>;
  status: string;
  subtitle: string;
  title: string;
  tone: CueTone;
};

type MediaAccessState = {
  camera: string;
  microphone: string;
  screen: string;
  signalCamera: boolean | undefined;
  signalMicrophone: boolean | undefined;
};

type ConsoleShellTab = 'workspace' | 'chats' | 'devices' | 'system' | 'console';

type IncomingDirectCallPrompt = {
  conversationId: string;
  isVideoCall: boolean;
  title: string;
};

const MIMO_ACTIVITY_STALE_AFTER_MS = 60_000;
const MIMO_ACTIVITY_ARCHIVE_AFTER_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDirectCallStatus(call: ActiveCallType): string {
  if (call.callMode !== 'Direct') {
    return '';
  }

  if (call.callState == null && call.outgoingRing) {
    return 'Calling…';
  }

  switch (call.callState) {
    case CallState.Accepted:
      return 'Connected';
    case CallState.Reconnecting:
      return 'Reconnecting';
    case CallState.Ringing:
      return 'Ringing';
    case CallState.Prering:
      return 'Connecting';
    case CallState.Ended:
      return 'Ended';
    default:
      if (call.outgoingRing) {
        return 'Calling…';
      }
      return 'Idle';
  }
}

function getMiMoStageSeverityStyle(
  severity: 'red' | 'yellow' | 'green' | null
): React.CSSProperties {
  if (severity === 'red') {
    return {
      border: `2px solid ${CS.critical}`,
      boxShadow: `0 0 0 3px ${CS.critical}55, ${CS.shadow3}`,
    };
  }

  if (severity === 'yellow') {
    return {
      border: `2px solid ${CS.warning}`,
      boxShadow: `0 0 0 3px ${CS.warning}55, ${CS.shadow3}`,
    };
  }

  if (severity === 'green') {
    return {
      border: `1px solid ${CS.success}`,
      boxShadow: `0 0 0 2px ${CS.success}44, ${CS.shadow3}`,
    };
  }

  return {};
}

function getGroupCallStatus(
  connectionState: GroupCallConnectionState,
  joinState: GroupCallJoinState
): string {
  if (joinState === GroupJoinState.Joined) {
    switch (connectionState) {
      case GroupConnectionState.Connected:
        return 'Connected';
      case GroupConnectionState.Reconnecting:
        return 'Reconnecting';
      case GroupConnectionState.Connecting:
        return 'Connecting';
      default:
        return 'Not connected';
    }
  }

  switch (joinState) {
    case GroupJoinState.Joining:
      return 'Joining';
    case GroupJoinState.Pending:
      return 'Waiting approval';
    default:
      return 'Not joined';
  }
}

function renderModeLabel(callMode: CallMode): string {
  switch (callMode) {
    case CallModeValue.Direct:
      return 'Direct call';
    case CallModeValue.Group:
      return 'Group call';
    case CallModeValue.Adhoc:
      return 'Call link';
    default:
      return 'Call';
  }
}

function getToneName(tone: CueTone): 'good' | 'warning' | 'critical' | 'info' {
  return tone;
}

function getStrongestTone(cues: ReadonlyArray<ConsoleCue>): CueTone {
  if (cues.some(cue => cue.tone === 'critical')) {
    return 'critical';
  }
  if (cues.some(cue => cue.tone === 'warning')) {
    return 'warning';
  }
  if (cues.some(cue => cue.tone === 'good')) {
    return 'good';
  }
  return 'info';
}

function getCueTonePriority(tone: CueTone): number {
  switch (tone) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'good':
      return 1;
    case 'info':
    default:
      return 0;
  }
}

function getMiMoSeverityRank(
  severity: 'red' | 'yellow' | 'green' | null
): number {
  switch (severity) {
    case 'red':
      return 3;
    case 'yellow':
      return 2;
    case 'green':
      return 1;
    default:
      return 0;
  }
}

function getToneCardAccentStyle(tone: CueTone): React.CSSProperties {
  if (tone === 'critical') {
    return {
      border: `1px solid ${CS.critical}55`,
      boxShadow: `inset 3px 0 0 ${CS.critical}`,
      background: CS.criticalSoft,
    };
  }
  if (tone === 'warning') {
    return {
      border: `1px solid ${CS.warning}55`,
      boxShadow: `inset 3px 0 0 ${CS.warning}`,
      background: CS.warningSoft,
    };
  }
  if (tone === 'good') {
    return {
      border: `1px solid ${CS.success}55`,
      boxShadow: `inset 3px 0 0 ${CS.success}`,
      background: CS.successSoft,
    };
  }
  return {};
}

function normalizeTimestamp(value: number): number {
  if (value <= 0) {
    return 0;
  }

  return value < 1e12 ? value * 1000 : value;
}

function getMiMoHeartbeatAgeMs(
  client: MiMoClientSnapshotType,
  now: number
): number {
  const lastHeartbeatUnixMs = normalizeTimestamp(client.lastHeartbeatUnixMs);
  if (!lastHeartbeatUnixMs) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, now - lastHeartbeatUnixMs);
}

function getEffectiveMiMoConnectivityState(
  client: MiMoClientSnapshotType,
  now: number
): NonNullable<MiMoClientSnapshotType['connectivityState']> {
  if (client.sessionStatus === 'ended') {
    return 'offline';
  }

  if (getMiMoHeartbeatAgeMs(client, now) > MIMO_ACTIVITY_STALE_AFTER_MS) {
    return 'offline';
  }

  if (client.connectivityState === 'reconnecting') {
    return 'reconnecting';
  }

  if (client.connectivityState === 'offline') {
    return 'offline';
  }

  return 'online';
}

function shouldHideMiMoActivityMonitorClient(
  client: MiMoClientSnapshotType,
  now: number
): boolean {
  if (client.alerts.some(alert => alert.severity !== 'green')) {
    return false;
  }

  if (getMiMoHeartbeatAgeMs(client, now) <= MIMO_ACTIVITY_ARCHIVE_AFTER_MS) {
    return false;
  }

  return getEffectiveMiMoConnectivityState(client, now) === 'offline';
}

function formatTimestamp(value: number): string {
  const timestamp = normalizeTimestamp(value);
  if (!timestamp) {
    return 'Unavailable';
  }

  return new Date(timestamp).toLocaleString();
}

function formatRustDeskExpiry(value: number | null): string {
  if (!value) {
    return 'Not set';
  }
  const deltaMs = value - Date.now();
  if (deltaMs <= 0) {
    return 'Expired';
  }
  const deltaMinutes = Math.max(1, Math.round(deltaMs / 60_000));
  return `${formatTimestamp(value)} (in ${deltaMinutes}m)`;
}

function maskSecret(value: string | null): string {
  if (!value) {
    return 'Not available';
  }
  if (value.length <= 2) {
    return '*'.repeat(value.length);
  }
  return `${'*'.repeat(Math.max(6, value.length - 2))}${value.slice(-2)}`;
}

function formatMediaStatus(value: string): string {
  switch (value) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'not-determined':
      return 'Not determined';
    case 'restricted':
      return 'Restricted';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function getMediaStatusTone(
  status: string,
  signalPermission?: boolean
): CueTone {
  if (status === 'denied' || signalPermission === false) {
    return 'critical';
  }
  if (status === 'granted') {
    return 'good';
  }
  return 'warning';
}

function getSignalPermissionLabel(value: boolean | undefined): string {
  if (value === true) {
    return 'Allowed in Signal';
  }
  if (value === false) {
    return 'Blocked in Signal';
  }
  return 'Not checked';
}

function getStatusDotColor(activeCall: ActiveCallType | undefined): string {
  if (!activeCall) {
    return CS.onSurfaceMuted;
  }
  if (activeCall.callMode === CallModeValue.Direct) {
    if (activeCall.callState === CallState.Accepted) {
      return CS.success;
    }
    if (activeCall.callState === CallState.Reconnecting) {
      return CS.warning;
    }
    if (
      activeCall.callState === CallState.Prering ||
      activeCall.callState === CallState.Ringing
    ) {
      return CS.warning;
    }
    if (activeCall.callState == null && activeCall.outgoingRing) {
      return CS.warning;
    }
    if (activeCall.callState === CallState.Ended) {
      return CS.onSurfaceMuted;
    }
    return CS.critical;
  }
  // Group/Adhoc
  if (activeCall.connectionState === GroupConnectionState.Connected) {
    return CS.success;
  }
  if (activeCall.connectionState === GroupConnectionState.Reconnecting) {
    return CS.warning;
  }
  return CS.info;
}

const TAB_ICONS: Record<ConsoleShellTab, string> = {
  workspace: ICONS.workspace,
  chats: ICONS.chat,
  devices: ICONS.devices,
  system: ICONS.system,
  console: ICONS.info,
};

const DEVICE_ICONS: Record<string, string> = {
  Camera: ICONS.camera,
  Microphone: ICONS.mic,
  'Screen Capture': ICONS.screen,
  'Audio Output': ICONS.speaker,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TherapistConsoleModal({
  activeCall,
  addMembersToGroup,
  availableCameras,
  availableCallLinks,
  availableConversations,
  availableMicrophones,
  availableSpeakers,
  changeIODevice,
  getGroupCallVideoFrameSource,
  i18n,
  onApprovePendingParticipant,
  onBreakoutToOneToOne,
  onClose,
  onCreateCallLink,
  onDenyPendingParticipant,
  onEndCall,
  onJoinCallLink,
  onOpenCallControls,
  onRejoinSavedMultiParty,
  onRemoteMute,
  onRemoveParticipant,
  onStartAudioCall,
  onStartVideoCall,
  incomingDirectCall,
  onAcceptIncomingCall = () => undefined,
  onDeclineIncomingCall = () => undefined,
  onToggleAudio,
  onToggleVideo,
  onUpdateCallLinkName,
  selectedCamera,
  selectedMicrophone,
  selectedSpeaker,
  setGroupCallVideoRequest,
  setLocalPreviewContainer,
  setRendererCanvas,
  showShareCallLinkViaSignal,
  showConversation,
  startCall,
  savedMultiPartyContext = null,
  breakoutBusy = false,
  setLocalAudio,
  setLocalVideo,
  cancelPresenting,
}: PropsType): React.JSX.Element {
  const imageDataCache = useRef<CallingImageDataCache | null>(new Map());
  const localPreviewInsetRef = useRef<HTMLDivElement | null>(null);
  const localPreviewStageRef = useRef<HTMLDivElement | null>(null);
  const pushToTalkActivatedAudioRef = useRef(false);
  const focusModeMediaRestoreRef = useRef<{
    hadLocalAudio: boolean;
    hadLocalVideo: boolean;
  }>({ hadLocalAudio: true, hadLocalVideo: false });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [spotlightedSessionId, setSpotlightedSessionId] = useState<
    string | null
  >(null);
  /** Group/adhoc: spotlight + hide other tiles + mute outgoing group media (no per-participant SFU routing). */
  const [focusModeSessionId, setFocusModeSessionId] = useState<string | null>(
    null
  );
  const [activeShellTab, setActiveShellTab] =
    useState<ConsoleShellTab>('workspace');
  const [selectedLaunchConversationId, setSelectedLaunchConversationId] =
    useState<string | null>(null);
  const [selectedLaunchCallLinkRoomId, setSelectedLaunchCallLinkRoomId] =
    useState<string | null>(null);
  const [addGroupMembersOpen, setAddGroupMembersOpen] = useState(false);
  const [addGroupMembersRequestState, setAddGroupMembersRequestState] =
    useState<RequestState>(RequestState.Inactive);
  const [createNewGroupWizardOpen, setCreateNewGroupWizardOpen] =
    useState(false);
  const [isTalkingToSession, setIsTalkingToSession] = useState(false);
  const [isSendingVideoToSession, setIsSendingVideoToSession] = useState(false);
  const [monitoringQualityMode, setMonitoringQualityMode] =
    useState<TherapistMonitoringQualityMode>('balanced');
  const [remoteAccessBusy, setRemoteAccessBusy] = useState(false);
  const [remoteAccessError, setRemoteAccessError] = useState<string | null>(
    null
  );
  const [showRustDeskPassword, setShowRustDeskPassword] = useState(false);
  const [copiedRustDeskField, setCopiedRustDeskField] = useState<
    'id' | 'password' | null
  >(null);
  const [editingCallLinkRoomId, setEditingCallLinkRoomId] = useState<
    string | null
  >(null);
  const [editingCallLinkName, setEditingCallLinkName] = useState('');

  const [mediaAccess, setMediaAccess] = useState<MediaAccessState>({
    camera: 'unknown',
    microphone: 'unknown',
    screen: 'unknown',
    signalCamera: undefined,
    signalMicrophone: undefined,
  });

  const conversationByServiceId = useSelector(
    getConversationByServiceIdSelector
  );
  const mimoClients = useSelector(
    (state: StateType) => state.mimoSession.clients
  );
  const [activityMonitorNow, setActivityMonitorNow] = useState(() =>
    Date.now()
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActivityMonitorNow(Date.now());
    }, 5_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const mimoClientList = useMemo(
    () =>
      Object.values(mimoClients)
        .filter(
          client =>
            !shouldHideMiMoActivityMonitorClient(client, activityMonitorNow)
        )
        .map(client => ({
          ...client,
          connectivityState: getEffectiveMiMoConnectivityState(
            client,
            activityMonitorNow
          ),
        }))
        .sort((left, right) => {
          const severityDelta =
            getMiMoSeverityRank(getWorstMiMoAlertSeverity(right.alerts)) -
            getMiMoSeverityRank(getWorstMiMoAlertSeverity(left.alerts));
          if (severityDelta !== 0) {
            return severityDelta;
          }

          return right.lastHeartbeatUnixMs - left.lastHeartbeatUnixMs;
        }),
    [activityMonitorNow, mimoClients]
  );

  // ---- Keyboard ----

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (addGroupMembersOpen) {
        setAddGroupMembersOpen(false);
        setAddGroupMembersRequestState(RequestState.Inactive);
        return;
      }
      if (createNewGroupWizardOpen) {
        setCreateNewGroupWizardOpen(false);
        return;
      }
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [addGroupMembersOpen, createNewGroupWizardOpen, onClose]);

  // ---- Media access ----

  useEffect(() => {
    let canceled = false;

    const loadMediaAccess = async () => {
      const [camera, microphone, screen, signalMicrophone, signalCamera] =
        await Promise.all([
          window.IPC.getMediaAccessStatus('camera'),
          window.IPC.getMediaAccessStatus('microphone'),
          window.IPC.getMediaAccessStatus('screen'),
          window.IPC.getMediaPermissions(),
          window.IPC.getMediaCameraPermissions(),
        ]);

      if (canceled) {
        return;
      }

      setMediaAccess({
        camera,
        microphone,
        screen,
        signalCamera,
        signalMicrophone,
      });
    };

    void loadMediaAccess();

    return () => {
      canceled = true;
    };
  }, []);

  // ---- Derived data ----

  const launchableConversations = useMemo(
    () =>
      availableConversations
        .filter(conversation => {
          return (
            conversation.removalStage == null &&
            !conversation.isMe &&
            (conversation.type === 'direct' || conversation.type === 'group')
          );
        })
        .sort((left, right) => {
          const leftTimestamp =
            left.activeAt ??
            left.timestamp ??
            left.lastMessageReceivedAtMs ??
            left.lastUpdated ??
            0;
          const rightTimestamp =
            right.activeAt ??
            right.timestamp ??
            right.lastMessageReceivedAtMs ??
            right.lastUpdated ??
            0;

          return rightTimestamp - leftTimestamp;
        })
        .slice(0, 12),
    [availableConversations]
  );

  const launchableCallLinks = useMemo(
    () =>
      availableCallLinks
        .slice()
        .sort((left, right) => {
          const leftTimestamp = left.expiration ?? 0;
          const rightTimestamp = right.expiration ?? 0;
          return rightTimestamp - leftTimestamp;
        })
        .slice(0, 8),
    [availableCallLinks]
  );

  useEffect(() => {
    if (
      selectedLaunchConversationId &&
      availableConversations.some(
        conversation => conversation.id === selectedLaunchConversationId
      )
    ) {
      return;
    }

    setSelectedLaunchConversationId(launchableConversations[0]?.id ?? null);
  }, [
    availableConversations,
    launchableConversations,
    selectedLaunchConversationId,
  ]);

  useEffect(() => {
    if (activeShellTab !== 'chats' || !selectedLaunchConversationId) {
      return;
    }
    void showConversation({ conversationId: selectedLaunchConversationId });
  }, [activeShellTab, selectedLaunchConversationId, showConversation]);

  useEffect(() => {
    if (
      selectedLaunchCallLinkRoomId &&
      launchableCallLinks.some(
        callLink => callLink.roomId === selectedLaunchCallLinkRoomId
      )
    ) {
      return;
    }

    setSelectedLaunchCallLinkRoomId(launchableCallLinks[0]?.roomId ?? null);
  }, [launchableCallLinks, selectedLaunchCallLinkRoomId]);

  const refreshMediaAccess = async (): Promise<void> => {
    const [camera, microphone, screen, signalMicrophone, signalCamera] =
      await Promise.all([
        window.IPC.getMediaAccessStatus('camera'),
        window.IPC.getMediaAccessStatus('microphone'),
        window.IPC.getMediaAccessStatus('screen'),
        window.IPC.getMediaPermissions(),
        window.IPC.getMediaCameraPermissions(),
      ]);

    setMediaAccess({
      camera,
      microphone,
      screen,
      signalCamera,
      signalMicrophone,
    });
  };

  const environmentRows = useMemo(
    () => [
      ['Version', window.SignalContext.getVersion()],
      ['Environment', window.SignalContext.getEnvironment()],
      ['Title', window.getTitle()],
      ['Platform', `${window.platform} / ${navigator.platform}`],
      ['Hostname', window.getHostName()],
      ['Build created', formatTimestamp(window.getBuildCreation())],
      ['Build expires', formatTimestamp(window.getBuildExpiration())],
    ],
    []
  );

  const buildPipelineRows = useMemo(
    () => [
      ['Install', 'corepack pnpm install'],
      ['Native deps', 'corepack pnpm run electron:install-app-deps'],
      ['Typecheck', 'corepack pnpm run check:types'],
      ['Run app', 'NODE_ENV=production corepack pnpm start'],
    ],
    []
  );

  const selectedLaunchConversation = useMemo(
    () =>
      availableConversations.find(
        conversation => conversation.id === selectedLaunchConversationId
      ),
    [availableConversations, selectedLaunchConversationId]
  );

  const selectedLaunchCallLink = useMemo(
    () =>
      launchableCallLinks.find(
        callLink => callLink.roomId === selectedLaunchCallLinkRoomId
      ),
    [launchableCallLinks, selectedLaunchCallLinkRoomId]
  );

  const groupMembershipsForAddMembers = useMemo(() => {
    if (
      !selectedLaunchConversation ||
      selectedLaunchConversation.type !== 'group'
    ) {
      return null;
    }
    return getGroupMemberships(
      selectedLaunchConversation,
      conversationByServiceId
    );
  }, [conversationByServiceId, selectedLaunchConversation]);

  const conversationIdsAlreadyInGroup = useMemo(
    () =>
      new Set(
        groupMembershipsForAddMembers?.memberships.map(
          membership => membership.member.id
        ) ?? []
      ),
    [groupMembershipsForAddMembers]
  );

  useEffect(() => {
    if (
      !selectedLaunchConversation ||
      selectedLaunchConversation.type !== 'group'
    ) {
      setAddGroupMembersOpen(false);
      setAddGroupMembersRequestState(RequestState.Inactive);
    }
  }, [selectedLaunchConversation]);

  const openAddGroupMembersInConsole = useCallback(() => {
    if (
      !selectedLaunchConversation ||
      selectedLaunchConversation.type !== 'group' ||
      !selectedLaunchConversation.canAddNewMembers
    ) {
      return;
    }
    setAddGroupMembersRequestState(RequestState.Inactive);
    setAddGroupMembersOpen(true);
  }, [selectedLaunchConversation]);

  const openCreateNewGroupWizard = useCallback(() => {
    setCreateNewGroupWizardOpen(true);
  }, []);

  const handleNewGroupCreated = useCallback((conversationId: string) => {
    setSelectedLaunchConversationId(conversationId);
    setCreateNewGroupWizardOpen(false);
  }, []);

  const workspaceConversationType = useMemo(() => {
    if (!selectedLaunchConversation) {
      return '';
    }
    return selectedLaunchConversation.type === 'group' ? 'Group' : 'Direct';
  }, [selectedLaunchConversation]);

  const workspaceConversationLastActive = useMemo(() => {
    if (!selectedLaunchConversation) {
      return '';
    }
    return formatTimestamp(
      selectedLaunchConversation.activeAt ??
        selectedLaunchConversation.timestamp ??
        selectedLaunchConversation.lastMessageReceivedAtMs ??
        selectedLaunchConversation.lastUpdated ??
        0
    );
  }, [selectedLaunchConversation]);

  const workspaceConversationMembers = useMemo(() => {
    if (!selectedLaunchConversation) {
      return 0;
    }
    return selectedLaunchConversation.membersCount ?? 0;
  }, [selectedLaunchConversation]);

  const workspaceCallLinkRestriction = useMemo(() => {
    if (!selectedLaunchCallLink) {
      return '';
    }
    return selectedLaunchCallLink.restrictions === 1
      ? 'Admin approval'
      : 'Open join';
  }, [selectedLaunchCallLink]);

  const workspaceCallLinkExpiration = useMemo(() => {
    if (!selectedLaunchCallLink) {
      return '';
    }
    return formatTimestamp(selectedLaunchCallLink.expiration ?? 0);
  }, [selectedLaunchCallLink]);

  const shellTabs = useMemo(
    () =>
      [
        { id: 'workspace', label: 'Sessions' },
        { id: 'chats', label: 'Messages' },
        { id: 'devices', label: 'Devices' },
        { id: 'system', label: 'Environment' },
        { id: 'console', label: 'Help' },
      ] satisfies Array<{ id: ConsoleShellTab; label: string }>,
    []
  );

  const deviceStatusRows = useMemo<
    Array<{
      action?: () => void;
      actionLabel: string;
      detail: string;
      label: string;
      settingsAction?: () => void;
      settingsLabel: string;
      status: string;
      tone: CueTone;
    }>
  >(
    () => [
      {
        action: () => {
          void window.IPC.showPermissionsPopup(false, true);
        },
        actionLabel: 'Request in Signal',
        detail: getSignalPermissionLabel(mediaAccess.signalCamera),
        label: 'Camera',
        settingsAction: () => {
          void window.IPC.openSystemMediaPermissions('camera');
        },
        settingsLabel: 'System Settings',
        status: formatMediaStatus(mediaAccess.camera),
        tone: getMediaStatusTone(mediaAccess.camera, mediaAccess.signalCamera),
      },
      {
        action: () => {
          void window.IPC.showPermissionsPopup(true, false);
        },
        actionLabel: 'Request in Signal',
        detail: getSignalPermissionLabel(mediaAccess.signalMicrophone),
        label: 'Microphone',
        settingsAction: () => {
          void window.IPC.openSystemMediaPermissions('microphone');
        },
        settingsLabel: 'System Settings',
        status: formatMediaStatus(mediaAccess.microphone),
        tone: getMediaStatusTone(
          mediaAccess.microphone,
          mediaAccess.signalMicrophone
        ),
      },
      {
        action: undefined,
        actionLabel: '',
        detail: 'macOS screen recording permission',
        label: 'Screen Capture',
        settingsAction: () => {
          void window.IPC.openSystemMediaPermissions('screenCapture');
        },
        settingsLabel: 'Open System Settings',
        status: formatMediaStatus(mediaAccess.screen),
        tone: getMediaStatusTone(mediaAccess.screen),
      },
      {
        action: undefined,
        actionLabel: '',
        detail:
          selectedSpeaker?.name ??
          (availableSpeakers.length
            ? 'Output device available'
            : 'No output devices detected'),
        label: 'Audio Output',
        settingsAction: undefined,
        settingsLabel: '',
        status: availableSpeakers.length ? 'Ready' : 'Unavailable',
        tone: availableSpeakers.length ? 'good' : 'warning',
      },
    ],
    [
      availableSpeakers.length,
      mediaAccess.camera,
      mediaAccess.microphone,
      mediaAccess.screen,
      mediaAccess.signalCamera,
      mediaAccess.signalMicrophone,
      selectedSpeaker?.name,
    ]
  );

  // ---- Call cues ----

  const callCues = useMemo<Array<ConsoleCue>>(() => {
    if (!activeCall) {
      return [];
    }

    if (activeCall.callMode === CallModeValue.Direct) {
      const cues: Array<ConsoleCue> = [];

      if (activeCall.callState === CallState.Reconnecting) {
        cues.push({
          label: 'Connection',
          detail: 'Remote participant is reconnecting.',
          tone: 'warning',
        });
      } else if (activeCall.callState === CallState.Ended) {
        cues.push({
          label: 'Connection',
          detail: 'The direct call has ended.',
          tone: 'critical',
        });
      } else if (activeCall.callState === CallState.Accepted) {
        cues.push({
          label: 'Connection',
          detail: 'Direct call is live and stable.',
          tone: 'good',
        });
      }

      if (!activeCall.hasRemoteVideo) {
        cues.push({
          label: 'Video',
          detail: 'Remote video is not available.',
          tone: 'warning',
        });
      }

      if (!activeCall.hasRemoteAudio) {
        cues.push({
          label: 'Audio',
          detail: 'Remote audio is not available.',
          tone: 'warning',
        });
      }

      if (activeCall.remoteAudioLevel > 0) {
        cues.push({
          label: 'Activity',
          detail: 'Remote participant is actively speaking.',
          tone: 'good',
        });
      }

      return cues;
    }

    const cues: Array<ConsoleCue> = [];

    if (activeCall.connectionState === GroupConnectionState.Reconnecting) {
      cues.push({
        label: 'Connection',
        detail: 'Group call is reconnecting.',
        tone: 'warning',
      });
    } else if (activeCall.connectionState === GroupConnectionState.Connecting) {
      cues.push({
        label: 'Connection',
        detail: 'Group call is still connecting.',
        tone: 'info',
      });
    }

    if (activeCall.remoteParticipants.length === 0) {
      cues.push({
        label: 'Participants',
        detail: 'No remote participants are currently visible.',
        tone: 'critical',
      });
    }

    if (activeCall.pendingParticipants.length > 0) {
      cues.push({
        label: 'Requests',
        detail: `${activeCall.pendingParticipants.length} join request${activeCall.pendingParticipants.length === 1 ? '' : 's'} waiting for review.`,
        tone: 'warning',
      });
    }

    const presenters = activeCall.remoteParticipants.filter(
      participant => participant.presenting
    );
    if (presenters.length > 0) {
      cues.push({
        label: 'Presentation',
        detail: `${presenters.length} participant${presenters.length === 1 ? '' : 's'} presenting.`,
        tone: 'info',
      });
    }

    const missingVideo = activeCall.remoteParticipants.filter(
      participant => !participant.hasRemoteVideo
    );
    if (missingVideo.length > 0) {
      cues.push({
        label: 'Video',
        detail: `${missingVideo.length} participant${missingVideo.length === 1 ? '' : 's'} without remote video.`,
        tone: 'warning',
      });
    }

    const missingMediaKeys = activeCall.remoteParticipants.filter(
      participant => !participant.mediaKeysReceived
    );
    if (missingMediaKeys.length > 0) {
      cues.push({
        label: 'Media Keys',
        detail: `${missingMediaKeys.length} participant${missingMediaKeys.length === 1 ? '' : 's'} waiting on media keys.`,
        tone: 'warning',
      });
    }

    return cues;
  }, [activeCall]);

  /** MiMo alerts for ingest rows that do not match any current call participant. */
  const unmatchedMiMoCallCues = useMemo<Array<ConsoleCue>>(() => {
    if (!activeCall) {
      return [];
    }
    const matched = getActiveCallMiMoClientSessionIdSet(activeCall);
    const out: Array<ConsoleCue> = [];
    for (const client of Object.values(mimoClients)) {
      if (matched.has(client.clientSessionId) || client.alerts.length === 0) {
        continue;
      }
      out.push(...miMoAlertsToConsoleCues(client.alerts));
    }
    return out;
  }, [activeCall, mimoClients]);

  const callAlertsForSessionPanel = useMemo<Array<ConsoleCue>>(
    () => [...unmatchedMiMoCallCues, ...callCues],
    [unmatchedMiMoCallCues, callCues]
  );

  // ---- Sessions ----

  const sessions = useMemo<Array<ConsoleSession>>(() => {
    if (!activeCall) {
      return [];
    }

    if (activeCall.callMode === CallModeValue.Direct) {
      const cues: Array<ConsoleCue> = [];

      if (activeCall.remoteAudioLevel > 0) {
        cues.push({ label: 'Activity', detail: 'Speaking now.', tone: 'good' });
      }
      if (!activeCall.hasRemoteVideo) {
        cues.push({
          label: 'Video',
          detail: 'Remote video unavailable.',
          tone: 'warning',
        });
      }
      if (!activeCall.hasRemoteAudio) {
        cues.push({
          label: 'Audio',
          detail: 'Remote audio unavailable.',
          tone: 'warning',
        });
      }
      if (activeCall.callState === CallState.Reconnecting) {
        cues.push({
          label: 'Connection',
          detail: 'Participant reconnecting.',
          tone: 'warning',
        });
      }

      const mimoDirect = findMiMoSnapshotForDirectCall(mimoClients, activeCall);
      if (mimoDirect?.alerts.length) {
        cues.push(...miMoAlertsToConsoleCues(mimoDirect.alerts));
      }

      return [
        {
          cues,
          id: activeCall.conversation.id,
          rows: [
            ['Participant', activeCall.conversation.title],
            ['Status', getDirectCallStatus(activeCall)],
            ['Video', activeCall.hasRemoteVideo ? 'Live' : 'Unavailable'],
            ['Audio', activeCall.hasRemoteAudio ? 'Live' : 'Unavailable'],
          ],
          status: getDirectCallStatus(activeCall),
          subtitle: 'Remote participant',
          title: activeCall.conversation.title,
          tone: getStrongestTone(cues),
        },
      ];
    }

    const prioritizedSessions = activeCall.remoteParticipants
      .map((participant, index) => {
        const isSpeaking =
          (activeCall.remoteAudioLevels.get(participant.demuxId) ?? 0) > 0;
        const cues: Array<ConsoleCue> = [];

        if (participant.presenting) {
          cues.push({
            label: 'Presentation',
            detail: 'Currently presenting.',
            tone: 'info',
          });
        }
        if (isSpeaking) {
          cues.push({
            label: 'Activity',
            detail: 'Speaking now.',
            tone: 'good',
          });
        }
        if (!participant.hasRemoteVideo) {
          cues.push({
            label: 'Video',
            detail: 'Remote video unavailable.',
            tone: 'warning',
          });
        }
        if (!participant.hasRemoteAudio) {
          cues.push({
            label: 'Audio',
            detail: 'Remote audio unavailable.',
            tone: 'warning',
          });
        }
        if (!participant.mediaKeysReceived) {
          cues.push({
            label: 'Media Keys',
            detail: 'Media keys have not arrived yet.',
            tone: 'warning',
          });
        }

        const mimoGroup = findMiMoSnapshotForGroupParticipant(
          mimoClients,
          participant
        );
        if (mimoGroup?.alerts.length) {
          cues.push(...miMoAlertsToConsoleCues(mimoGroup.alerts));
        }

        const tone = getStrongestTone(cues);

        const session: ConsoleSession = {
          cues,
          id: String(participant.demuxId),
          rows: [
            ['Participant', participant.title],
            [
              'Status',
              participant.presenting
                ? 'Presenting'
                : participant.hasRemoteVideo
                  ? 'Video live'
                  : participant.hasRemoteAudio
                    ? 'Audio only'
                    : 'Passive',
            ],
            ['Video', participant.hasRemoteVideo ? 'Live' : 'Unavailable'],
            ['Audio', participant.hasRemoteAudio ? 'Live' : 'Unavailable'],
            ['Screen share', participant.presenting ? 'Yes' : 'No'],
            ['Media keys', participant.mediaKeysReceived ? 'Ready' : 'Pending'],
          ] as const,
          status: participant.presenting
            ? 'Presenting'
            : isSpeaking
              ? 'Speaking'
              : participant.hasRemoteVideo
                ? 'Video live'
                : 'Monitoring',
          subtitle: participant.presenting
            ? 'Presenter'
            : participant.hasRemoteVideo
              ? 'Video participant'
              : 'Audio/observer',
          title: participant.title,
          tone,
        };
        return {
          index,
          isSpeaking,
          session,
        };
      })
      .sort((left, right) => {
        const toneDelta =
          getCueTonePriority(right.session.tone) -
          getCueTonePriority(left.session.tone);
        if (toneDelta !== 0) {
          return toneDelta;
        }

        // Speaking participants get priority when triage severity is equal.
        if (left.isSpeaking !== right.isSpeaking) {
          return Number(right.isSpeaking) - Number(left.isSpeaking);
        }

        // Stable fallback: preserve RingRTC participant order.
        return left.index - right.index;
      });

    return prioritizedSessions.map(item => item.session);
  }, [activeCall, mimoClients]);

  useEffect(() => {
    if (!sessions.length) {
      if (selectedSessionId !== null) {
        setSelectedSessionId(null);
      }
      if (spotlightedSessionId !== null) {
        setSpotlightedSessionId(null);
      }
      if (focusModeSessionId !== null) {
        setFocusModeSessionId(null);
        setLocalAudio({
          enabled: focusModeMediaRestoreRef.current.hadLocalAudio,
        });
        setLocalVideo({
          enabled: focusModeMediaRestoreRef.current.hadLocalVideo,
        });
      }
      return;
    }

    if (
      !selectedSessionId ||
      !sessions.some(session => session.id === selectedSessionId)
    ) {
      setSelectedSessionId(sessions[0]?.id ?? null);
    }
    if (
      spotlightedSessionId &&
      !sessions.some(session => session.id === spotlightedSessionId)
    ) {
      setSpotlightedSessionId(null);
    }
    if (
      focusModeSessionId &&
      !sessions.some(session => session.id === focusModeSessionId)
    ) {
      setFocusModeSessionId(null);
      setLocalAudio({
        enabled: focusModeMediaRestoreRef.current.hadLocalAudio,
      });
      setLocalVideo({
        enabled: focusModeMediaRestoreRef.current.hadLocalVideo,
      });
    }
  }, [
    focusModeSessionId,
    selectedSessionId,
    sessions,
    setLocalAudio,
    setLocalVideo,
    spotlightedSessionId,
  ]);

  const selectedSession =
    sessions.find(session => session.id === selectedSessionId) ?? sessions[0];

  const selectedMiMoSnapshot = useMemo(() => {
    if (!selectedSession) {
      return undefined;
    }
    return findMiMoSnapshotForSessionTile(
      mimoClients,
      activeCall,
      selectedSession.id
    );
  }, [activeCall, mimoClients, selectedSession]);

  useEffect(() => {
    setShowRustDeskPassword(false);
    setCopiedRustDeskField(null);
    setRemoteAccessError(null);
  }, [selectedMiMoSnapshot?.clientSessionId]);

  const copyRustDeskField = useCallback(
    async (field: 'id' | 'password', value: string | null | undefined) => {
      if (!value) {
        setRemoteAccessError(`No RustDesk ${field} available to copy.`);
        return;
      }
      setRemoteAccessError(null);

      try {
        if (window.SignalClipboard?.copyTextTemporarily) {
          window.SignalClipboard.copyTextTemporarily(value, 60_000);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          throw new Error('Clipboard API unavailable');
        }

        setCopiedRustDeskField(field);
        setTimeout(() => {
          setCopiedRustDeskField(current =>
            current === field ? null : current
          );
        }, 1500);
      } catch (error) {
        setRemoteAccessError(
          `Failed to copy RustDesk ${field}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    []
  );

  const requestRemoteAccess = useCallback(async () => {
    if (!selectedMiMoSnapshot?.clientSessionId || remoteAccessBusy) {
      return;
    }
    setRemoteAccessBusy(true);
    setRemoteAccessError(null);

    try {
      window.reduxActions?.mimoSession?.markRustDeskRequested?.({
        clientSessionId: selectedMiMoSnapshot.clientSessionId,
        atUnixMs: Date.now(),
      });
      await sendRemoteControlRequest(selectedMiMoSnapshot.clientSessionId);
    } catch (error) {
      setRemoteAccessError(
        `Failed to request access: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setRemoteAccessBusy(false);
    }
  }, [remoteAccessBusy, selectedMiMoSnapshot]);

  const endRemoteAccess = useCallback(async () => {
    if (!selectedMiMoSnapshot?.clientSessionId || remoteAccessBusy) {
      return;
    }
    setRemoteAccessBusy(true);
    setRemoteAccessError(null);

    try {
      await sendRemoteRelease(selectedMiMoSnapshot.clientSessionId);
      window.reduxActions?.mimoSession?.markRustDeskEnded?.({
        clientSessionId: selectedMiMoSnapshot.clientSessionId,
        atUnixMs: Date.now(),
      });
    } catch (error) {
      setRemoteAccessError(
        `Failed to end access: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setRemoteAccessBusy(false);
    }
  }, [remoteAccessBusy, selectedMiMoSnapshot]);

  const openRustDesk = useCallback(async () => {
    setRemoteAccessError(null);
    try {
      await window.IPC.openExternalUrl('rustdesk://');
    } catch (error) {
      setRemoteAccessError(
        `Failed to open RustDesk: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }, []);

  const spotlightedParticipant =
    activeCall?.callMode === CallModeValue.Direct
      ? undefined
      : activeCall?.remoteParticipants.find(
          participant => String(participant.demuxId) === spotlightedSessionId
        );

  const directStageWorstSeverity = useMemo(() => {
    if (!activeCall || activeCall.callMode !== CallModeValue.Direct) {
      return null;
    }
    const snap = findMiMoSnapshotForDirectCall(mimoClients, activeCall);
    return getWorstMiMoAlertSeverity(snap?.alerts) ?? null;
  }, [activeCall, mimoClients]);

  const spotlightStageWorstSeverity = useMemo(() => {
    if (!spotlightedParticipant) {
      return null;
    }
    const snap = findMiMoSnapshotForGroupParticipant(
      mimoClients,
      spotlightedParticipant
    );
    return getWorstMiMoAlertSeverity(snap?.alerts) ?? null;
  }, [mimoClients, spotlightedParticipant]);

  const selectedLiveParticipant =
    activeCall?.callMode === CallModeValue.Direct
      ? undefined
      : activeCall?.remoteParticipants.find(
          participant => String(participant.demuxId) === selectedSession?.id
        );

  const selectedInterventionConversation = useMemo(() => {
    if (!selectedLiveParticipant) {
      return undefined;
    }

    if (selectedLiveParticipant.serviceId) {
      const directConversation = conversationByServiceId(
        selectedLiveParticipant.serviceId
      );
      if (directConversation?.type === 'direct') {
        return directConversation;
      }
    }

    return selectedLiveParticipant.type === 'direct'
      ? selectedLiveParticipant
      : undefined;
  }, [conversationByServiceId, selectedLiveParticipant]);

  const selectedInterventionTargetTitle =
    selectedInterventionConversation?.title ??
    selectedSession?.title ??
    'this session';
  const privateAudioUnavailableMessage = focusModeSessionId
    ? 'Focus Mode mutes your mic for the whole group so others do not hear you. RingRTC group calls cannot send your audio to only one participant; that would need a parallel 1:1 call, which this app does not run while a group call is active.'
    : selectedInterventionConversation
      ? `A direct Signal conversation exists with ${selectedInterventionTargetTitle}, but the current calling stack cannot keep the group call live and privately route therapist audio to one client only.`
      : selectedSession
        ? 'Select a participant with a linked direct Signal conversation. Private audio while staying inside the group call still needs a separate sidecar media channel.'
        : 'Select a participant tile to prepare focus mode. Private audio is not available while the group call stays active in this build.';
  const privateVideoUnavailableMessage = focusModeSessionId
    ? 'Focus Mode turns off your group camera and screen share. The SFU still publishes group video the same way for everyone; private video to one client is not available without leaving this group call in the current Signal Desktop build.'
    : selectedInterventionConversation
      ? `A direct Signal conversation exists with ${selectedInterventionTargetTitle}, but camera and screen share are still sent at the group-call level in this build.`
      : selectedSession
        ? 'Select a participant with a linked direct Signal conversation. Private camera and screen share still need a separate sidecar media channel.'
        : 'Select a participant tile to prepare focus mode. Private camera and screen share are not available while the group call stays active in this build.';

  const pendingParticipants =
    activeCall?.callMode === CallModeValue.Direct
      ? []
      : (activeCall?.pendingParticipants ?? []);

  const directConversation =
    activeCall?.callMode === CallModeValue.Direct &&
    activeCall.conversation.type === 'direct'
      ? activeCall.conversation
      : undefined;

  const isGroupCallLobby =
    activeCall != null &&
    activeCall.callMode !== CallModeValue.Direct &&
    activeCall.joinState !== GroupJoinState.Joined;

  const isSendingVideo = Boolean(
    activeCall?.hasLocalVideo || activeCall?.presentingSource
  );
  const shouldShowStageLocalPreview =
    activeCall?.callMode !== undefined &&
    activeCall.callMode !== CallModeValue.Direct &&
    activeCall.remoteParticipants.length === 0 &&
    isSendingVideo;

  useLayoutEffect(() => {
    if (!activeCall || !isSendingVideo) {
      setLocalPreviewContainer({
        container: undefined,
        sizeCallback: undefined,
      });
      return;
    }

    const container = shouldShowStageLocalPreview
      ? localPreviewStageRef.current
      : localPreviewInsetRef.current;
    if (!container) {
      return;
    }

    setLocalPreviewContainer({
      container,
      sizeCallback: undefined,
    });

    return () => {
      setLocalPreviewContainer({
        container: undefined,
        sizeCallback: undefined,
      });
    };
  }, [
    activeCall,
    isSendingVideo,
    setLocalPreviewContainer,
    shouldShowStageLocalPreview,
  ]);

  // Local preview is an HTMLVideoElement with intrinsic dimensions (see GumVideoCapturer);
  // fill the stage or PIP container like module-ongoing-call__local-preview-fullsize.
  useLayoutEffect(() => {
    if (!activeCall || !isSendingVideo) {
      return;
    }
    const container = shouldShowStageLocalPreview
      ? localPreviewStageRef.current
      : localPreviewInsetRef.current;
    const video = container?.querySelector('video');
    if (!video) {
      return;
    }
    const isPresenting = Boolean(activeCall.presentingSource);
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.borderRadius = '0';
    video.style.transform = isPresenting ? 'none' : 'rotateY(180deg)';
  }, [
    activeCall,
    activeCall?.presentingSource,
    isSendingVideo,
    shouldShowStageLocalPreview,
  ]);

  const isSelectedSessionSpotlighted =
    selectedSession != null && selectedSession.id === spotlightedSessionId;
  const isSelectedSessionFocusMode =
    selectedSession != null && selectedSession.id === focusModeSessionId;
  const isSingleSessionInterventionMode =
    activeCall?.callMode === CallModeValue.Direct;

  const exitFocusMode = useCallback(() => {
    if (focusModeSessionId == null) {
      return;
    }
    setFocusModeSessionId(null);
    setLocalAudio({
      enabled: focusModeMediaRestoreRef.current.hadLocalAudio,
    });
    setLocalVideo({
      enabled: focusModeMediaRestoreRef.current.hadLocalVideo,
    });
  }, [focusModeSessionId, setLocalAudio, setLocalVideo]);

  const enterFocusMode = useCallback(() => {
    if (!activeCall || !selectedSession?.id) {
      return;
    }
    if (!isGroupOrAdhocCallMode(activeCall.callMode)) {
      return;
    }
    focusModeMediaRestoreRef.current = {
      hadLocalAudio: activeCall.hasLocalAudio,
      hadLocalVideo: activeCall.hasLocalVideo,
    };
    setSpotlightedSessionId(selectedSession.id);
    setFocusModeSessionId(selectedSession.id);
    setLocalAudio({ enabled: false });
    setLocalVideo({ enabled: false });
    if (activeCall.presentingSource) {
      cancelPresenting();
    }
  }, [
    activeCall,
    cancelPresenting,
    selectedSession?.id,
    setLocalAudio,
    setLocalVideo,
  ]);

  useEffect(() => {
    if (focusModeSessionId == null) {
      return;
    }
    if (spotlightedSessionId !== focusModeSessionId) {
      setFocusModeSessionId(null);
      setLocalAudio({
        enabled: focusModeMediaRestoreRef.current.hadLocalAudio,
      });
      setLocalVideo({
        enabled: focusModeMediaRestoreRef.current.hadLocalVideo,
      });
    }
  }, [focusModeSessionId, setLocalAudio, setLocalVideo, spotlightedSessionId]);

  useEffect(() => {
    if (!activeCall && focusModeSessionId !== null) {
      setFocusModeSessionId(null);
      setLocalAudio({
        enabled: focusModeMediaRestoreRef.current.hadLocalAudio,
      });
      setLocalVideo({
        enabled: focusModeMediaRestoreRef.current.hadLocalVideo,
      });
    }
  }, [activeCall, focusModeSessionId, setLocalAudio, setLocalVideo]);

  useEffect(() => {
    if (activeCall?.callMode === CallModeValue.Direct) {
      setMonitoringQualityMode('balanced');
    }
  }, [activeCall?.callMode]);

  // ====================================================================
  // RENDER: MiMo metadata panel
  // ====================================================================

  const mimoMetadataPanel = useMemo(
    () => (
      <div style={csMiMoPanel()}>
        <div
          style={{
            ...csSectionLabel(),
            marginBottom: '10px',
            color: CS.secondary,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Icon svg={ICONS.pulse} size={14} color={CS.secondary} />
          Activity Monitor
          {mimoClientList.length > 0 ? (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '10px',
                fontWeight: 600,
                color: CS.onSurfaceMuted,
              }}
            >
              {mimoClientList.length}
            </span>
          ) : null}
        </div>
        {mimoClientList.length === 0 ? (
          <div
            style={{
              fontSize: '12px',
              color: CS.onSurfaceMuted,
              lineHeight: 1.5,
            }}
          >
            No client activity detected yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {mimoClientList.map(client => {
              const match = findMiMoCallMatch(
                activeCall,
                client.clientSessionId
              );
              const worstAlert = getWorstMiMoAlertSeverity(client.alerts);
              const sessionTone: CueTone =
                worstAlert === 'red'
                  ? 'critical'
                  : worstAlert === 'yellow'
                    ? 'warning'
                    : worstAlert === 'green'
                      ? 'good'
                      : 'info';

              const sessionStatusColor =
                client.sessionStatus === 'active'
                  ? CS.success
                  : client.sessionStatus === 'paused'
                    ? CS.warning
                    : client.sessionStatus === 'ended'
                      ? CS.onSurfaceMuted
                      : CS.onSurfaceMuted;

              const connectivityColor =
                client.connectivityState === 'online'
                  ? CS.success
                  : client.connectivityState === 'reconnecting'
                    ? CS.warning
                    : client.connectivityState === 'offline'
                      ? CS.critical
                      : CS.onSurfaceMuted;

              const visibleAlerts = client.alerts
                .filter(a => a.severity !== 'green')
                .slice(0, 3);

              return (
                <div
                  key={client.clientSessionId}
                  style={{
                    ...csCardNested(),
                    ...getToneCardAccentStyle(sessionTone),
                    padding: '12px 16px',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  {/* Header row: call-match dot + name + status badges */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background:
                          match.kind === 'participant'
                            ? CS.success
                            : CS.warning,
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        fontWeight: 700,
                        color: CS.onSurface,
                        fontFamily: CS.fontDisplay,
                        fontSize: '13px',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {match.kind === 'participant'
                        ? match.participantTitle
                        : 'Client session'}
                    </div>
                    {/* Session status badge */}
                    {client.sessionStatus ? (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 650,
                          color: sessionStatusColor,
                          background: `${sessionStatusColor}18`,
                          border: `1px solid ${sessionStatusColor}44`,
                          borderRadius: CS.radiusFull,
                          padding: '1px 7px',
                          flexShrink: 0,
                          textTransform: 'capitalize',
                        }}
                      >
                        {client.sessionStatus}
                      </span>
                    ) : null}
                    {/* Connectivity badge */}
                    {client.connectivityState ? (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 650,
                          color: connectivityColor,
                          background: `${connectivityColor}18`,
                          border: `1px solid ${connectivityColor}44`,
                          borderRadius: CS.radiusFull,
                          padding: '1px 7px',
                          flexShrink: 0,
                          textTransform: 'capitalize',
                        }}
                      >
                        {client.connectivityState}
                      </span>
                    ) : null}
                  </div>

                  {/* Game + module */}
                  {client.gameId ? (
                    <div
                      style={{
                        color: CS.onSurfaceVariant,
                        fontSize: '12px',
                        marginBottom: '2px',
                      }}
                    >
                      Game:{' '}
                      <strong style={{ color: CS.onSurface }}>
                        {client.gameId}
                      </strong>
                    </div>
                  ) : null}
                  {client.currentModule ? (
                    <div
                      style={{
                        color: CS.onSurfaceVariant,
                        fontSize: '12px',
                        marginBottom: '2px',
                      }}
                    >
                      Module:{' '}
                      <strong style={{ color: CS.onSurface }}>
                        {client.currentModule}
                      </strong>
                    </div>
                  ) : null}
                  {client.expectedActivityType ? (
                    <div
                      style={{
                        color: CS.onSurfaceVariant,
                        fontSize: '12px',
                        marginBottom: '2px',
                      }}
                    >
                      Activity:{' '}
                      <strong style={{ color: CS.onSurface }}>
                        {client.expectedActivityType}
                      </strong>
                    </div>
                  ) : null}

                  {/* Progress bar */}
                  {client.activityProgress != null ? (
                    <div style={{ marginBottom: '6px', marginTop: '2px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '3px',
                        }}
                      >
                        <span
                          style={{
                            color: CS.onSurfaceVariant,
                            fontSize: '11px',
                          }}
                        >
                          Progress
                        </span>
                        <span
                          style={{
                            color: CS.onSurface,
                            fontSize: '11px',
                            fontWeight: 650,
                          }}
                        >
                          {Math.round(client.activityProgress * 100)}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: '5px',
                          borderRadius: '3px',
                          background: CS.surfaceHighest,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.round(client.activityProgress * 100))}%`,
                            background: CS.secondary,
                            borderRadius: '3px',
                            transition: 'width 400ms ease',
                          }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Individual alert rows (non-green only, max 3) */}
                  {visibleAlerts.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gap: '3px',
                        marginBottom: '4px',
                      }}
                    >
                      {visibleAlerts.map(alert => {
                        const alertColor =
                          alert.severity === 'red' ? CS.critical : CS.warning;
                        return (
                          <div
                            key={alert.alertId}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '5px',
                              fontSize: '11px',
                              padding: '4px 7px',
                              borderRadius: CS.radius,
                              background: `${alertColor}11`,
                              border: `1px solid ${alertColor}33`,
                            }}
                          >
                            <span
                              style={{
                                color: alertColor,
                                flexShrink: 0,
                                marginTop: '1px',
                              }}
                            >
                              ●
                            </span>
                            <span
                              style={{
                                color: CS.onSurfaceSecondary,
                                lineHeight: 1.4,
                              }}
                            >
                              <strong style={{ color: alertColor }}>
                                {alert.type.replace(/_/g, ' ')}
                              </strong>
                              {alert.message ? ` — ${alert.message}` : ''}
                            </span>
                          </div>
                        );
                      })}
                      {client.alerts.filter(a => a.severity !== 'green')
                        .length > 3 ? (
                        <div
                          style={{
                            fontSize: '10px',
                            color: CS.onSurfaceMuted,
                            paddingLeft: '4px',
                          }}
                        >
                          +
                          {client.alerts.filter(a => a.severity !== 'green')
                            .length - 3}{' '}
                          more alert
                          {client.alerts.filter(a => a.severity !== 'green')
                            .length -
                            3 ===
                          1
                            ? ''
                            : 's'}
                        </div>
                      ) : null}
                    </div>
                  ) : client.alerts.length > 0 ? (
                    // All alerts are green (healthy signal)
                    <div
                      style={{
                        fontSize: '11px',
                        color: CS.success,
                        marginBottom: '4px',
                      }}
                    >
                      ✓ Healthy activity signal
                    </div>
                  ) : null}

                  {/* Footer: heartbeat */}
                  <div
                    style={{
                      color: CS.onSurfaceMuted,
                      fontSize: '11px',
                      marginTop: '2px',
                    }}
                  >
                    Last active: {formatTimestamp(client.lastHeartbeatUnixMs)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),
    [activeCall, mimoClientList]
  );

  // ====================================================================
  // RENDER: Modals (add members, new group)
  // ====================================================================

  const addGroupMembersModalNode =
    addGroupMembersOpen && selectedLaunchConversation?.type === 'group' ? (
      <AddGroupMembersModal
        clearRequestError={() => {
          setAddGroupMembersRequestState(RequestState.Inactive);
        }}
        conversationIdsAlreadyInGroup={conversationIdsAlreadyInGroup}
        groupTitle={selectedLaunchConversation.title}
        i18n={i18n}
        makeRequest={async conversationIds => {
          setAddGroupMembersRequestState(RequestState.Active);
          addMembersToGroup(selectedLaunchConversation.id, conversationIds, {
            onSuccess: () => {
              setAddGroupMembersOpen(false);
              setAddGroupMembersRequestState(RequestState.Inactive);
            },
            onFailure: () => {
              setAddGroupMembersRequestState(RequestState.InactiveWithError);
            },
          });
        }}
        maxGroupSize={getGroupSizeHardLimit(1001)}
        maxRecommendedGroupSize={getGroupSizeRecommendedLimit(151)}
        onClose={() => {
          setAddGroupMembersOpen(false);
          setAddGroupMembersRequestState(RequestState.Inactive);
        }}
        requestState={addGroupMembersRequestState}
        renderChooseGroupMembersModal={
          renderChooseGroupMembersModalForTherapistConsole
        }
        renderConfirmAdditionsModal={
          renderConfirmAdditionsModalForTherapistConsole
        }
      />
    ) : null;

  const createNewGroupWizardNode = createNewGroupWizardOpen ? (
    <TherapistNewGroupWizard
      i18n={i18n}
      onClose={() => setCreateNewGroupWizardOpen(false)}
      onGroupCreated={handleNewGroupCreated}
    />
  ) : null;

  // ====================================================================
  // RENDER: Main
  // ====================================================================

  return (
    <>
      <ModalContainer>
        <div
          onClick={onClose}
          style={{
            ...csBackdrop(),
            zIndex: THERAPIST_CONSOLE_SHELL_Z_INDEX,
          }}
        >
          <section
            aria-label="Signal Therapist Console"
            onClick={event => event.stopPropagation()}
            style={csShellPanel()}
          >
            {/* ============================================================
              HEADER
              ============================================================ */}
            <header style={csHeader()}>
              <div
                style={{
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: CS.radiusLg,
                    background: CS.gradientSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 10px rgba(27, 123, 110, 0.22)',
                    flexShrink: 0,
                  }}
                >
                  <Icon svg={ICONS.leaf} size={20} color="#fff" />
                </div>
                <div>
                  <div style={csHeaderEyebrow()}>Signal Therapy</div>
                  <h1 style={csHeaderTitle()}>Session Console</h1>
                </div>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
              >
                {activeCall ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 14px',
                      borderRadius: CS.radiusFull,
                      background: CS.successSoft,
                      border: `1px solid rgba(45, 122, 78, 0.15)`,
                    }}
                  >
                    <span
                      style={{
                        ...csStatusDot(CS.success),
                        width: '8px',
                        height: '8px',
                        animation: 'pulse 2s ease-in-out infinite',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 650,
                        color: CS.success,
                      }}
                    >
                      Session Active
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 14px',
                      borderRadius: CS.radiusFull,
                      background: CS.surfaceHigh,
                    }}
                  >
                    <span
                      style={{
                        ...csStatusDot(
                          incomingDirectCall ? CS.warning : CS.onSurfaceMuted
                        ),
                        width: '8px',
                        height: '8px',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: incomingDirectCall
                          ? CS.warning
                          : CS.onSurfaceMuted,
                      }}
                    >
                      {incomingDirectCall ? 'Incoming call' : 'Ready'}
                    </span>
                  </div>
                )}
                <button type="button" onClick={onClose} style={csCloseButton()}>
                  <Icon svg={ICONS.close} size={13} />
                </button>
              </div>
            </header>

            {/* ============================================================
              IDLE STATE (no active call)
              ============================================================ */}
            {!activeCall ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px minmax(0, 1fr)',
                  minHeight: 0,
                }}
              >
                {/* ---- Sidebar ---- */}
                <aside style={csAside()}>
                  {/* Welcome card */}
                  <div
                    style={{
                      padding: '18px',
                      borderRadius: CS.radiusLg,
                      background: CS.card,
                      marginBottom: '20px',
                      textAlign: 'left',
                      boxShadow: CS.shadow1,
                      border: `1px solid ${CS.outlineSubtle}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '10px',
                      }}
                    >
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: CS.secondarySoft,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon
                          svg={ICONS.heart}
                          size={18}
                          color={CS.secondary}
                        />
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            color: CS.onSurface,
                            fontFamily: CS.fontDisplay,
                          }}
                        >
                          Welcome back
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: CS.onSurfaceMuted,
                            marginTop: '1px',
                          }}
                        >
                          {new Date().toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: CS.onSurfaceVariant,
                        lineHeight: 1.5,
                      }}
                    >
                      Select a client or call link to begin a session.
                    </div>
                  </div>

                  {/* Nav tabs */}
                  <div
                    style={{
                      ...csSectionLabel(),
                      paddingLeft: '14px',
                      marginBottom: '6px',
                    }}
                  >
                    Navigation
                  </div>
                  <nav
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      marginBottom: '20px',
                    }}
                  >
                    {shellTabs.map(tab => {
                      const isSelected = activeShellTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveShellTab(tab.id)}
                          style={csShellTab(isSelected)}
                        >
                          <span
                            style={csNavTabIcon(isSelected)}
                            dangerouslySetInnerHTML={{
                              __html: TAB_ICONS[tab.id],
                            }}
                          />
                          {tab.label}
                        </button>
                      );
                    })}
                  </nav>

                  {mimoMetadataPanel}
                </aside>

                {/* ---- Main content ---- */}
                <div style={csMainColumn()}>
                  {incomingDirectCall ? (
                    <div
                      style={{
                        ...csBannerWarning(),
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '14px',
                      }}
                    >
                      <Icon svg={ICONS.pulse} size={16} />
                      <span
                        style={{
                          flex: '1 1 220px',
                          fontSize: '12px',
                          lineHeight: 1.45,
                          fontWeight: 600,
                        }}
                      >
                        Incoming{' '}
                        {incomingDirectCall.isVideoCall ? 'video' : 'audio'}{' '}
                        call from <strong>{incomingDirectCall.title}</strong>.
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onAcceptIncomingCall(
                            incomingDirectCall.conversationId,
                            false
                          )
                        }
                        style={{
                          ...csSecondaryButton(),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Pick up (audio)
                      </button>
                      {incomingDirectCall.isVideoCall ? (
                        <button
                          type="button"
                          onClick={() =>
                            onAcceptIncomingCall(
                              incomingDirectCall.conversationId,
                              true
                            )
                          }
                          style={{
                            ...csPrimaryButton(false),
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Pick up (video)
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          onDeclineIncomingCall(
                            incomingDirectCall.conversationId
                          )
                        }
                        style={{
                          ...csSecondaryButton(),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  ) : null}

                  {/* =========== WORKSPACE TAB =========== */}
                  {activeShellTab === 'workspace' ? (
                    <div style={{ display: 'grid', gap: '24px' }}>
                      {/* Title + Actions row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <h2
                            style={{
                              ...csWorkspaceTitle(),
                              marginBottom: '4px',
                            }}
                          >
                            Sessions
                          </h2>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '13px',
                              color: CS.onSurfaceMuted,
                              lineHeight: 1.4,
                            }}
                          >
                            Start a call, manage groups, or share a link.
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={openCreateNewGroupWizard}
                            style={{
                              ...csSecondaryButton(),
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12.5px',
                            }}
                          >
                            <Icon svg={ICONS.plus} size={14} />
                            New Group
                          </button>
                          <button
                            type="button"
                            disabled={
                              !selectedLaunchConversation ||
                              selectedLaunchConversation.type !== 'group' ||
                              !selectedLaunchConversation.canAddNewMembers
                            }
                            onClick={openAddGroupMembersInConsole}
                            style={{
                              ...(!selectedLaunchConversation ||
                              selectedLaunchConversation.type !== 'group' ||
                              !selectedLaunchConversation.canAddNewMembers
                                ? csPrimaryButton(true)
                                : csSecondaryButton()),
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12.5px',
                            }}
                          >
                            <Icon svg={ICONS.users} size={14} />
                            Add Members
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'minmax(240px, 300px) minmax(0, 1fr)',
                          gap: '20px',
                        }}
                      >
                        {/* Conversation list */}
                        <div style={{ ...csCard(), padding: '16px' }}>
                          <div
                            style={{
                              ...csSectionLabel(),
                              marginBottom: '12px',
                              paddingLeft: '6px',
                            }}
                          >
                            Clients &amp; Groups
                          </div>
                          <div style={{ display: 'grid', gap: '3px' }}>
                            {launchableConversations.length ? (
                              launchableConversations.map(conversation => {
                                const isSelected =
                                  selectedLaunchConversationId ===
                                  conversation.id;
                                return (
                                  <button
                                    key={conversation.id}
                                    type="button"
                                    onClick={() =>
                                      setSelectedLaunchConversationId(
                                        conversation.id
                                      )
                                    }
                                    style={{
                                      ...csConversationRow(isSelected),
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '12px',
                                    }}
                                  >
                                    <AvatarCircle
                                      name={conversation.title}
                                      size={34}
                                    />
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div
                                        style={{
                                          fontWeight: 600,
                                          marginBottom: '2px',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          fontSize: '13px',
                                          color: isSelected
                                            ? CS.onSurface
                                            : CS.onSurfaceSecondary,
                                        }}
                                      >
                                        {conversation.title}
                                      </div>
                                      <div
                                        style={{
                                          color: CS.onSurfaceMuted,
                                          fontSize: '11px',
                                        }}
                                      >
                                        {conversation.type === 'group'
                                          ? 'Group'
                                          : 'Individual'}
                                      </div>
                                    </div>
                                    {isSelected && (
                                      <Icon
                                        svg={ICONS.chevronRight}
                                        size={13}
                                        color={CS.primary}
                                      />
                                    )}
                                  </button>
                                );
                              })
                            ) : (
                              <div
                                style={{
                                  padding: '24px 16px',
                                  textAlign: 'center',
                                }}
                              >
                                <Icon
                                  svg={ICONS.users}
                                  size={24}
                                  color={CS.onSurfaceMuted}
                                  style={{ marginBottom: '8px', opacity: 0.5 }}
                                />
                                <div
                                  style={{
                                    fontSize: '13px',
                                    color: CS.onSurfaceMuted,
                                    lineHeight: 1.5,
                                  }}
                                >
                                  No clients yet.
                                </div>
                                <div
                                  style={{
                                    fontSize: '11px',
                                    color: CS.onSurfaceMuted,
                                    marginTop: '4px',
                                  }}
                                >
                                  Start a conversation to see clients here.
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right panel: conversation detail + call links */}
                        <div style={{ display: 'grid', gap: '20px' }}>
                          {/* Conversation detail */}
                          <div style={csCard()}>
                            {selectedLaunchConversation ? (
                              <>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '14px',
                                    marginBottom: '18px',
                                  }}
                                >
                                  <AvatarCircle
                                    name={selectedLaunchConversation.title}
                                    size={44}
                                  />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                      style={{
                                        fontSize: '1.05rem',
                                        fontWeight: 700,
                                        fontFamily: CS.fontDisplay,
                                        color: CS.onSurface,
                                        letterSpacing: '-0.01em',
                                      }}
                                    >
                                      {selectedLaunchConversation.title}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '12px',
                                        color: CS.onSurfaceMuted,
                                        marginTop: '3px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                      }}
                                    >
                                      <span style={csBadge('neutral')}>
                                        {workspaceConversationType}
                                      </span>
                                      {workspaceConversationMembers > 0 ? (
                                        <span
                                          style={{ color: CS.onSurfaceMuted }}
                                        >
                                          {workspaceConversationMembers} members
                                        </span>
                                      ) : null}
                                      <span
                                        style={{ color: CS.outlineVariant }}
                                      >
                                        ·
                                      </span>
                                      <span>
                                        {workspaceConversationLastActive}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Group members */}
                                {groupMembershipsForAddMembers &&
                                groupMembershipsForAddMembers.memberships
                                  .length > 0 ? (
                                  <div style={{ marginBottom: '18px' }}>
                                    <div
                                      style={{
                                        ...csSectionLabel(),
                                        marginBottom: '10px',
                                      }}
                                    >
                                      Participants (
                                      {
                                        groupMembershipsForAddMembers
                                          .memberships.length
                                      }
                                      )
                                    </div>
                                    <div
                                      style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '6px',
                                      }}
                                    >
                                      {groupMembershipsForAddMembers.memberships.map(
                                        membership => (
                                          <span
                                            key={membership.member.id}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '6px',
                                              padding: '5px 12px',
                                              borderRadius: CS.radiusFull,
                                              background: CS.surfaceLow,
                                              fontSize: '11.5px',
                                              color: CS.onSurface,
                                              fontWeight: 500,
                                              border: `1px solid ${CS.outlineSubtle}`,
                                            }}
                                          >
                                            <AvatarCircle
                                              name={membership.member.title}
                                              size={20}
                                            />
                                            {membership.member.title}
                                            {membership.isAdmin ? (
                                              <span style={csBadge('info')}>
                                                Admin
                                              </span>
                                            ) : null}
                                          </span>
                                        )
                                      )}
                                    </div>
                                  </div>
                                ) : null}

                                {/* Call action buttons — cleaner, more prominent */}
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                      'repeat(2, minmax(0, 1fr))',
                                    gap: '10px',
                                  }}
                                >
                                  <button
                                    type="button"
                                    disabled={
                                      selectedLaunchConversation.type !==
                                      'direct'
                                    }
                                    onClick={() =>
                                      onStartAudioCall(
                                        selectedLaunchConversation.id
                                      )
                                    }
                                    style={{
                                      ...(selectedLaunchConversation.type ===
                                      'direct'
                                        ? csSecondaryButton()
                                        : csPrimaryButton(true)),
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '8px',
                                      padding: '12px 20px',
                                    }}
                                  >
                                    <Icon svg={ICONS.phone} size={15} />
                                    Audio Call
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onStartVideoCall(
                                        selectedLaunchConversation.id
                                      )
                                    }
                                    style={{
                                      ...csPrimaryButton(false),
                                      background: CS.gradientSecondary,
                                      boxShadow:
                                        '0 2px 10px rgba(27, 123, 110, 0.22)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '8px',
                                      padding: '12px 20px',
                                    }}
                                  >
                                    <Icon svg={ICONS.video} size={15} />
                                    {selectedLaunchConversation.type === 'group'
                                      ? 'Start Session'
                                      : 'Video Call'}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '40px 24px',
                                  textAlign: 'center',
                                }}
                              >
                                <div
                                  style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '50%',
                                    background: CS.surfaceLow,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '14px',
                                  }}
                                >
                                  <Icon
                                    svg={ICONS.video}
                                    size={22}
                                    color={CS.onSurfaceMuted}
                                  />
                                </div>
                                <div
                                  style={{
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: CS.onSurfaceSecondary,
                                    marginBottom: '4px',
                                  }}
                                >
                                  Select a client
                                </div>
                                <div
                                  style={{
                                    fontSize: '12px',
                                    color: CS.onSurfaceMuted,
                                    lineHeight: 1.5,
                                  }}
                                >
                                  Choose someone from the list to start a
                                  session.
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Call links card */}
                          <div style={csCard()}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                marginBottom: '16px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                }}
                              >
                                <div
                                  style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: CS.radius,
                                    background: CS.primarySoft,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  <Icon
                                    svg={ICONS.link}
                                    size={14}
                                    color={CS.primary}
                                  />
                                </div>
                                <span
                                  style={{
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    color: CS.onSurface,
                                    fontFamily: CS.fontDisplay,
                                  }}
                                >
                                  Call Links
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={onCreateCallLink}
                                style={{
                                  ...csSecondaryButton(),
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '12px',
                                  padding: '8px 16px',
                                }}
                              >
                                <Icon svg={ICONS.plus} size={13} />
                                Create Link
                              </button>
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '200px minmax(0, 1fr)',
                                gap: '14px',
                              }}
                            >
                              <div style={{ display: 'grid', gap: '4px' }}>
                                {launchableCallLinks.length ? (
                                  launchableCallLinks.map(callLink => {
                                    const isSelected =
                                      selectedLaunchCallLinkRoomId ===
                                      callLink.roomId;
                                    return (
                                      <button
                                        key={callLink.roomId}
                                        type="button"
                                        onClick={() =>
                                          setSelectedLaunchCallLinkRoomId(
                                            callLink.roomId
                                          )
                                        }
                                        style={{
                                          ...csConversationRow(isSelected),
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '10px',
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: CS.radius,
                                            background: isSelected
                                              ? CS.primarySoft
                                              : CS.surfaceLow,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            transition: `background ${CS.transitionFast}`,
                                          }}
                                        >
                                          <Icon
                                            svg={ICONS.link}
                                            size={14}
                                            color={
                                              isSelected
                                                ? CS.primary
                                                : CS.onSurfaceVariant
                                            }
                                          />
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                          <div
                                            style={{
                                              fontWeight: 600,
                                              marginBottom: '2px',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                              fontSize: '13px',
                                            }}
                                          >
                                            {callLink.name ||
                                              `Call Link ${callLink.roomId.slice(0, 8)}`}
                                          </div>
                                          <div
                                            style={{
                                              color: CS.onSurfaceMuted,
                                              fontSize: '11px',
                                            }}
                                          >
                                            {callLink.restrictions === 1
                                              ? 'Admin approval'
                                              : 'Open join'}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div
                                    style={{
                                      ...csDisplayMuted(),
                                      fontSize: '13px',
                                      padding: '8px 0',
                                    }}
                                  >
                                    No call links yet.
                                  </div>
                                )}
                              </div>
                              <div style={csCardNested()}>
                                {selectedLaunchCallLink ? (
                                  <>
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '12px',
                                      }}
                                    >
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        {editingCallLinkRoomId ===
                                        selectedLaunchCallLink.roomId ? (
                                          <div
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '6px',
                                            }}
                                          >
                                            <input
                                              type="text"
                                              value={editingCallLinkName}
                                              onChange={e =>
                                                setEditingCallLinkName(
                                                  e.target.value
                                                )
                                              }
                                              onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                  onUpdateCallLinkName(
                                                    selectedLaunchCallLink.roomId,
                                                    editingCallLinkName
                                                  );
                                                  setEditingCallLinkRoomId(
                                                    null
                                                  );
                                                } else if (e.key === 'Escape') {
                                                  setEditingCallLinkRoomId(
                                                    null
                                                  );
                                                }
                                              }}
                                              autoFocus
                                              style={{
                                                flex: 1,
                                                fontSize: '14px',
                                                fontWeight: 700,
                                                fontFamily: CS.fontDisplay,
                                                color: CS.onSurface,
                                                background: CS.surfaceLow,
                                                border: `1.5px solid ${CS.primary}`,
                                                borderRadius: CS.radiusMd,
                                                padding: '6px 10px',
                                                outline: 'none',
                                              }}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                onUpdateCallLinkName(
                                                  selectedLaunchCallLink.roomId,
                                                  editingCallLinkName
                                                );
                                                setEditingCallLinkRoomId(null);
                                              }}
                                              style={{
                                                border: 'none',
                                                borderRadius: CS.radiusMd,
                                                padding: '6px 10px',
                                                background: CS.successSoft,
                                                color: CS.success,
                                                cursor: 'pointer',
                                                fontWeight: 650,
                                                fontSize: '12px',
                                                fontFamily: CS.fontBody,
                                              }}
                                            >
                                              <Icon
                                                svg={ICONS.check}
                                                size={13}
                                              />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setEditingCallLinkRoomId(null)
                                              }
                                              style={{
                                                border: 'none',
                                                borderRadius: CS.radiusMd,
                                                padding: '6px 10px',
                                                background: CS.surfaceHigh,
                                                color: CS.onSurfaceMuted,
                                                cursor: 'pointer',
                                                fontWeight: 650,
                                                fontSize: '12px',
                                                fontFamily: CS.fontBody,
                                              }}
                                            >
                                              <Icon
                                                svg={ICONS.close}
                                                size={13}
                                              />
                                            </button>
                                          </div>
                                        ) : (
                                          <div
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '6px',
                                            }}
                                          >
                                            <div
                                              style={{
                                                fontSize: '14px',
                                                fontWeight: 700,
                                                fontFamily: CS.fontDisplay,
                                                color: CS.onSurface,
                                              }}
                                            >
                                              {selectedLaunchCallLink.name ||
                                                'Untitled'}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingCallLinkRoomId(
                                                  selectedLaunchCallLink.roomId
                                                );
                                                setEditingCallLinkName(
                                                  selectedLaunchCallLink.name ||
                                                    ''
                                                );
                                              }}
                                              title="Edit call name"
                                              style={{
                                                border: 'none',
                                                background: 'transparent',
                                                color: CS.onSurfaceMuted,
                                                cursor: 'pointer',
                                                padding: '2px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                borderRadius: CS.radius,
                                                transition: `color ${CS.transitionFast}`,
                                              }}
                                            >
                                              <Icon
                                                svg={ICONS.edit}
                                                size={13}
                                              />
                                            </button>
                                          </div>
                                        )}
                                        <div
                                          style={{
                                            fontSize: '11px',
                                            color: CS.onSurfaceMuted,
                                            marginTop: '2px',
                                          }}
                                        >
                                          {workspaceCallLinkRestriction} · Exp{' '}
                                          {workspaceCallLinkExpiration}
                                        </div>
                                      </div>
                                    </div>
                                    <div
                                      style={{
                                        display: 'flex',
                                        gap: '8px',
                                        flexWrap: 'wrap',
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onJoinCallLink(
                                            selectedLaunchCallLink.roomId
                                          )
                                        }
                                        style={{
                                          ...csPrimaryButton(false),
                                          background: CS.gradientSecondary,
                                          boxShadow:
                                            '0 2px 10px rgba(27, 123, 110, 0.20)',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          fontSize: '12.5px',
                                          padding: '10px 18px',
                                        }}
                                      >
                                        <Icon svg={ICONS.video} size={14} />
                                        Join Lobby
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const link = callLinkRootKeyToUrl(
                                            selectedLaunchCallLink.rootKey
                                          );
                                          if (link) {
                                            await copyCallLink(link);
                                          }
                                        }}
                                        style={{
                                          ...csSecondaryButton(),
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          fontSize: '12.5px',
                                          padding: '10px 18px',
                                        }}
                                      >
                                        <Icon svg={ICONS.copy} size={14} />
                                        Copy
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          showShareCallLinkViaSignal(
                                            selectedLaunchCallLink,
                                            i18n
                                          );
                                        }}
                                        style={{
                                          ...csSecondaryButton(),
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          fontSize: '12.5px',
                                          padding: '10px 18px',
                                        }}
                                      >
                                        <Icon svg={ICONS.share} size={14} />
                                        Share
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '24px 16px',
                                      textAlign: 'center',
                                    }}
                                  >
                                    <Icon
                                      svg={ICONS.link}
                                      size={20}
                                      color={CS.onSurfaceMuted}
                                      style={{
                                        marginBottom: '8px',
                                        opacity: 0.4,
                                      }}
                                    />
                                    <div
                                      style={{
                                        fontSize: '12px',
                                        color: CS.onSurfaceMuted,
                                      }}
                                    >
                                      Select a call link to view details.
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* =========== CHATS TAB =========== */}
                  {activeShellTab === 'chats' ? (
                    <div style={{ display: 'grid', gap: '16px', minHeight: 0 }}>
                      <div>
                        <h2
                          style={{ ...csWorkspaceTitle(), marginBottom: '4px' }}
                        >
                          Messages
                        </h2>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '13px',
                            color: CS.onSurfaceMuted,
                          }}
                        >
                          Send messages before, during, or after sessions.
                        </p>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '240px minmax(0, 1fr)',
                          gap: '16px',
                          minHeight: 0,
                          height: 'min(65vh, 680px)',
                        }}
                      >
                        <div
                          style={{
                            ...csCard(),
                            overflow: 'auto',
                            padding: '14px',
                          }}
                        >
                          <div
                            style={{
                              ...csSectionLabel(),
                              marginBottom: '10px',
                            }}
                          >
                            Conversations
                          </div>
                          <div style={{ display: 'grid', gap: '4px' }}>
                            {launchableConversations.length ? (
                              launchableConversations.map(conversation => {
                                const isSelected =
                                  selectedLaunchConversationId ===
                                  conversation.id;
                                return (
                                  <button
                                    key={conversation.id}
                                    type="button"
                                    onClick={() =>
                                      setSelectedLaunchConversationId(
                                        conversation.id
                                      )
                                    }
                                    style={{
                                      ...csConversationRow(isSelected),
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                    }}
                                  >
                                    <AvatarCircle
                                      name={conversation.title}
                                      size={28}
                                    />
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div
                                        style={{
                                          fontWeight: 600,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          fontSize: '13px',
                                        }}
                                      >
                                        {conversation.title}
                                      </div>
                                      <div
                                        style={{
                                          color: CS.onSurfaceMuted,
                                          fontSize: '11px',
                                        }}
                                      >
                                        {conversation.type === 'group'
                                          ? 'Group'
                                          : 'Direct'}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })
                            ) : (
                              <div
                                style={{
                                  ...csDisplayMuted(),
                                  fontSize: '13px',
                                }}
                              >
                                No conversations available.
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            ...csCard(),
                            padding: 0,
                            overflow: 'hidden',
                            minHeight: 0,
                            display: 'flex',
                          }}
                        >
                          {selectedLaunchConversation ? (
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateRows: 'minmax(0, 1fr) auto',
                                minHeight: 0,
                                height: '100%',
                                width: '100%',
                              }}
                            >
                              <div style={{ minHeight: 0 }}>
                                <SmartTimeline
                                  id={selectedLaunchConversation.id}
                                />
                              </div>
                              <div
                                style={{
                                  borderTop: `1px solid ${CS.outlineSubtle}`,
                                }}
                              >
                                <SmartCompositionArea
                                  id={selectedLaunchConversation.id}
                                />
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                padding: '32px 24px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flex: 1,
                                textAlign: 'center',
                              }}
                            >
                              <div
                                style={{
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '50%',
                                  background: CS.surfaceLow,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginBottom: '12px',
                                }}
                              >
                                <Icon
                                  svg={ICONS.chat}
                                  size={20}
                                  color={CS.onSurfaceMuted}
                                />
                              </div>
                              <div
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  color: CS.onSurfaceSecondary,
                                  marginBottom: '4px',
                                }}
                              >
                                No conversation selected
                              </div>
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: CS.onSurfaceMuted,
                                }}
                              >
                                Choose a client from the sidebar to view
                                messages.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* =========== DEVICES TAB =========== */}
                  {activeShellTab === 'devices' ? (
                    <div style={{ display: 'grid', gap: '24px' }}>
                      <div>
                        <h2
                          style={{ ...csWorkspaceTitle(), marginBottom: '4px' }}
                        >
                          Devices &amp; Permissions
                        </h2>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '13px',
                            color: CS.onSurfaceMuted,
                          }}
                        >
                          Verify camera, microphone, and audio access before
                          your session.
                        </p>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(280px, 1fr))',
                          gap: '16px',
                        }}
                      >
                        {deviceStatusRows.map(row => (
                          <div key={row.label} style={csCard()}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '10px',
                                marginBottom: '12px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                }}
                              >
                                <div
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: CS.radiusMd,
                                    background: CS.surfaceLow,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  <Icon
                                    svg={
                                      DEVICE_ICONS[row.label] ?? ICONS.devices
                                    }
                                    size={18}
                                    color={CS.onSurfaceVariant}
                                  />
                                </div>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    color: CS.onSurface,
                                    fontFamily: CS.fontDisplay,
                                    fontSize: '15px',
                                  }}
                                >
                                  {row.label}
                                </div>
                              </div>
                              <span style={csBadge(getToneName(row.tone))}>
                                {row.status}
                              </span>
                            </div>
                            <div
                              style={{
                                ...csDisplayMuted(),
                                fontSize: '13px',
                                lineHeight: 1.5,
                                marginBottom:
                                  row.action || row.settingsAction ? '14px' : 0,
                              }}
                            >
                              {row.detail}
                            </div>
                            {row.action || row.settingsAction ? (
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns:
                                    'repeat(2, minmax(0, 1fr))',
                                  gap: '10px',
                                }}
                              >
                                {row.action ? (
                                  <button
                                    type="button"
                                    onClick={row.action}
                                    style={{
                                      ...csPrimaryButton(false),
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    <Icon svg={ICONS.shield} size={14} />
                                    {row.actionLabel}
                                  </button>
                                ) : (
                                  <div />
                                )}
                                {row.settingsAction ? (
                                  <button
                                    type="button"
                                    onClick={row.settingsAction}
                                    style={{
                                      ...csSecondaryButton(),
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    <Icon svg={ICONS.system} size={14} />
                                    {row.settingsLabel}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      {/* Preferred devices */}
                      <div
                        style={{ ...csCard(), display: 'grid', gap: '16px' }}
                      >
                        <div
                          style={{
                            ...csSectionLabel(),
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: 0,
                          }}
                        >
                          <Icon
                            svg={ICONS.system}
                            size={14}
                            color={CS.onSurfaceMuted}
                          />
                          Preferred Devices
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns:
                              'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '14px',
                          }}
                        >
                          <div>
                            <div
                              style={{
                                ...csSectionLabel(),
                                marginBottom: '6px',
                              }}
                            >
                              Camera
                            </div>
                            <select
                              value={selectedCamera ?? ''}
                              onChange={event => {
                                changeIODevice({
                                  selectedDevice: event.target.value,
                                  type: CallingDeviceType.CAMERA,
                                });
                              }}
                              style={csFormSelect()}
                            >
                              {availableCameras.length ? (
                                availableCameras.map(device => (
                                  <option
                                    key={device.deviceId}
                                    value={device.deviceId}
                                  >
                                    {device.label || 'Camera'}
                                  </option>
                                ))
                              ) : (
                                <option value="">No cameras detected</option>
                              )}
                            </select>
                          </div>
                          <div>
                            <div
                              style={{
                                ...csSectionLabel(),
                                marginBottom: '6px',
                              }}
                            >
                              Microphone
                            </div>
                            <select
                              value={selectedMicrophone?.index ?? ''}
                              onChange={event => {
                                const nextDevice =
                                  availableMicrophones[
                                    Number(event.target.value)
                                  ];
                                if (!nextDevice) return;
                                changeIODevice({
                                  selectedDevice: nextDevice,
                                  type: CallingDeviceType.MICROPHONE,
                                });
                              }}
                              style={csFormSelect()}
                            >
                              {availableMicrophones.length ? (
                                availableMicrophones.map(device => (
                                  <option
                                    key={device.index}
                                    value={device.index}
                                  >
                                    {device.name}
                                  </option>
                                ))
                              ) : (
                                <option value="">
                                  No microphones detected
                                </option>
                              )}
                            </select>
                          </div>
                          <div>
                            <div
                              style={{
                                ...csSectionLabel(),
                                marginBottom: '6px',
                              }}
                            >
                              Audio Output
                            </div>
                            <select
                              value={selectedSpeaker?.index ?? ''}
                              onChange={event => {
                                const nextDevice =
                                  availableSpeakers[Number(event.target.value)];
                                if (!nextDevice) return;
                                changeIODevice({
                                  selectedDevice: nextDevice,
                                  type: CallingDeviceType.SPEAKER,
                                });
                              }}
                              style={csFormSelect()}
                            >
                              {availableSpeakers.length ? (
                                availableSpeakers.map(device => (
                                  <option
                                    key={device.index}
                                    value={device.index}
                                  >
                                    {device.name}
                                  </option>
                                ))
                              ) : (
                                <option value="">
                                  No output devices detected
                                </option>
                              )}
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void refreshMediaAccess();
                          }}
                          style={{
                            ...csSecondaryButton(),
                            justifySelf: 'start',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Icon svg={ICONS.refresh} size={14} />
                          Refresh Access Status
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* =========== SYSTEM TAB =========== */}
                  {activeShellTab === 'system' ? (
                    <div style={{ display: 'grid', gap: '24px' }}>
                      <div>
                        <h2
                          style={{ ...csWorkspaceTitle(), marginBottom: '4px' }}
                        >
                          Environment
                        </h2>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '13px',
                            color: CS.onSurfaceMuted,
                          }}
                        >
                          Technical details about your Signal installation.
                        </p>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '14px',
                        }}
                      >
                        {environmentRows.map(([label, value]) => (
                          <div key={label} style={csCard()}>
                            <div
                              style={{
                                ...csSectionLabel(),
                                marginBottom: '6px',
                              }}
                            >
                              {label}
                            </div>
                            <div
                              style={{
                                fontSize: '15px',
                                fontWeight: 700,
                                color: CS.onSurface,
                                fontFamily: CS.fontDisplay,
                                letterSpacing: '-0.01em',
                              }}
                            >
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={csCard()}>
                        <div
                          style={{
                            ...csSectionLabel(),
                            marginBottom: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Icon
                            svg={ICONS.sparkle}
                            size={14}
                            color={CS.onSurfaceMuted}
                          />
                          Build Pipeline
                        </div>
                        <div style={{ display: 'grid', gap: '10px' }}>
                          {buildPipelineRows.map(([label, value]) => (
                            <div key={label} style={csCardNested()}>
                              <div
                                style={{
                                  ...csSectionLabel(),
                                  marginBottom: '4px',
                                }}
                              >
                                {label}
                              </div>
                              <div
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  fontFamily: CS.fontMono,
                                  color: CS.onSurface,
                                  padding: '4px 0',
                                }}
                              >
                                {value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* =========== HELP TAB =========== */}
                  {activeShellTab === 'console' ? (
                    <div style={{ display: 'grid', gap: '24px' }}>
                      <div>
                        <h2
                          style={{ ...csWorkspaceTitle(), marginBottom: '4px' }}
                        >
                          Quick Guide
                        </h2>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '13px',
                            color: CS.onSurfaceMuted,
                          }}
                        >
                          How to use the Session Console effectively.
                        </p>
                      </div>

                      {/* Feature guide cards */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(260px, 1fr))',
                          gap: '16px',
                        }}
                      >
                        {(
                          [
                            {
                              icon: ICONS.video,
                              title: 'Sessions',
                              desc: 'Start video or audio calls with individual clients or groups. Monitor participant status in real-time.',
                            },
                            {
                              icon: ICONS.chat,
                              title: 'Messages',
                              desc: 'Send secure messages before, during, or after sessions. Full conversation history available.',
                            },
                            {
                              icon: ICONS.devices,
                              title: 'Devices',
                              desc: 'Verify camera, microphone, and audio permissions. Switch between input/output devices.',
                            },
                            {
                              icon: ICONS.link,
                              title: 'Call Links',
                              desc: 'Create shareable session links with optional admin approval for who can join.',
                            },
                          ] as const
                        ).map(guide => (
                          <div key={guide.title} style={csCard()}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: CS.radiusMd,
                                background: CS.secondarySoft,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '14px',
                              }}
                            >
                              <Icon
                                svg={guide.icon}
                                size={18}
                                color={CS.secondary}
                              />
                            </div>
                            <div
                              style={{
                                fontSize: '14px',
                                fontWeight: 700,
                                color: CS.onSurface,
                                fontFamily: CS.fontDisplay,
                                marginBottom: '6px',
                              }}
                            >
                              {guide.title}
                            </div>
                            <div
                              style={{
                                fontSize: '12.5px',
                                color: CS.onSurfaceVariant,
                                lineHeight: 1.6,
                              }}
                            >
                              {guide.desc}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={csCard()}>
                        <div
                          style={{
                            ...csDisplayMuted(),
                            fontSize: '13.5px',
                            lineHeight: 1.7,
                          }}
                        >
                          <strong
                            style={{
                              color: CS.onSurface,
                              fontFamily: CS.fontDisplay,
                              fontWeight: 700,
                            }}
                          >
                            Session Console
                          </strong>{' '}
                          is your central workspace for managing therapy
                          sessions through Signal. All communication is
                          end-to-end encrypted and private.
                        </div>
                        <div
                          style={{
                            marginTop: '16px',
                            padding: '16px 18px',
                            borderRadius: CS.radiusMd,
                            background: CS.secondarySoft,
                            border: `1px solid rgba(27, 123, 110, 0.10)`,
                            fontSize: '13px',
                            lineHeight: 1.6,
                            color: CS.onSurfaceSecondary,
                          }}
                        >
                          During an active session, this view switches to a live
                          monitoring dashboard with video feeds, participant
                          status, and session controls.
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              /* ============================================================
               ACTIVE CALL STATE
               ============================================================ */
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: 'auto 1fr',
                  height: '100%',
                  minHeight: 0,
                }}
              >
                {/* ---- Navigation bar (active call) ---- */}
                <nav
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    padding: '0 16px',
                    background: CS.surfaceLow,
                    borderBottom: `1px solid ${CS.outlineSubtle}`,
                    flexShrink: 0,
                  }}
                >
                  {shellTabs.map(tab => {
                    const isSelected = activeShellTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveShellTab(tab.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '9px 14px',
                          border: 'none',
                          borderBottom: isSelected
                            ? `2px solid ${CS.primary}`
                            : '2px solid transparent',
                          background: 'transparent',
                          color: isSelected ? CS.primary : CS.onSurfaceVariant,
                          cursor: 'pointer',
                          fontSize: '12.5px',
                          fontWeight: isSelected ? 650 : 500,
                          fontFamily: CS.fontBody,
                          transition: `all ${CS.transitionFast}`,
                          marginBottom: '-1px',
                        }}
                      >
                        <span
                          style={{
                            display: 'flex',
                            opacity: isSelected ? 1 : 0.65,
                          }}
                          dangerouslySetInnerHTML={{ __html: TAB_ICONS[tab.id] }}
                        />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>
                {activeShellTab === 'workspace' ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 300px',
                    height: '100%',
                    minHeight: 0,
                  }}
                >
                {/* ---- Main stage ---- */}
                <div
                  style={{
                    ...csActiveCallStage(),
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  {/* Call header bar — prominent status */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      marginBottom: '18px',
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                      }}
                    >
                      <span
                        style={csStatusDot(getStatusDotColor(activeCall))}
                      />
                      <div style={{ minWidth: 0 }}>
                        <h2
                          style={{
                            margin: 0,
                            fontSize: '1.15rem',
                            lineHeight: 1.25,
                            fontFamily: CS.fontDisplay,
                            fontWeight: 800,
                            color: CS.onSurface,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            letterSpacing: '-0.015em',
                          }}
                        >
                          {activeCall.conversation.title}
                        </h2>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginTop: '4px',
                          }}
                        >
                          <span
                            style={{
                              ...csBadge('neutral'),
                              padding: '2px 8px',
                              fontSize: '10px',
                            }}
                          >
                            {renderModeLabel(activeCall.callMode)}
                          </span>
                          {activeCall.callMode !== 'Direct' &&
                          activeCall.remoteParticipants.length > 0 ? (
                            <span
                              style={{
                                fontSize: '11px',
                                color: CS.onSurfaceMuted,
                              }}
                            >
                              {activeCall.remoteParticipants.length} participant
                              {activeCall.remoteParticipants.length !== 1
                                ? 's'
                                : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <span
                      style={csBadge(
                        activeCall.callMode === 'Direct'
                          ? activeCall.callState === CallState.Accepted
                            ? 'good'
                            : 'warning'
                          : activeCall.connectionState ===
                              GroupConnectionState.Connected
                            ? 'good'
                            : 'warning'
                      )}
                    >
                      {activeCall.callMode === 'Direct'
                        ? getDirectCallStatus(activeCall)
                        : getGroupCallStatus(
                            activeCall.connectionState,
                            activeCall.joinState
                          )}
                    </span>
                  </div>

                  {mimoMetadataPanel}

                  {savedMultiPartyContext &&
                  activeCall.callMode === CallModeValue.Direct ? (
                    <div
                      style={{
                        ...csBannerInfo(),
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <Icon svg={ICONS.info} size={16} color={CS.info} />
                      <span
                        style={{
                          flex: '1 1 220px',
                          fontSize: '12px',
                          lineHeight: 1.45,
                          fontWeight: 600,
                        }}
                      >
                        The client must accept this incoming Signal call on
                        their device. If they were still in the group or
                        call-link session, they may need to leave it or switch
                        to this chat to answer.
                      </span>
                    </div>
                  ) : null}

                  {savedMultiPartyContext && onRejoinSavedMultiParty ? (
                    <div
                      style={{
                        ...csBannerWarning(),
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '4px',
                      }}
                    >
                      <Icon svg={ICONS.pulse} size={16} />
                      <span
                        style={{
                          flex: '1 1 200px',
                          fontSize: '12px',
                          lineHeight: 1.45,
                        }}
                      >
                        Multi-party session paused: you can return to{' '}
                        <strong>{savedMultiPartyContext.title}</strong> (group
                        or call link).
                      </span>
                      <button
                        type="button"
                        disabled={breakoutBusy}
                        onClick={() => {
                          if (breakoutBusy) {
                            return;
                          }
                          if (
                            !window.confirm(
                              `Rejoin “${savedMultiPartyContext.title}”?${activeCall?.callMode === CallModeValue.Direct ? ' This will end the current 1:1 call if it is still active.' : ''}`
                            )
                          ) {
                            return;
                          }
                          onRejoinSavedMultiParty();
                        }}
                        style={{
                          ...csPrimaryButton(breakoutBusy),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {breakoutBusy
                          ? 'Working…'
                          : 'Rejoin multi-party session'}
                      </button>
                    </div>
                  ) : null}

                  {/* Video tile grid / spotlight / lobby */}
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    {isGroupCallLobby ? (
                      /* ---- Lobby ---- */
                      <div
                        style={{
                          ...csVideoWell(),
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <div style={csLobbyOverlay()}>
                          <div
                            ref={localPreviewStageRef}
                            style={{ position: 'absolute', inset: 0 }}
                          />
                          <div
                            style={{
                              position: 'relative',
                              zIndex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '16px',
                            }}
                          >
                            <div style={csLobbyTitle()}>
                              {activeCall.conversation.title}
                            </div>
                            {activeCall.peekedParticipants.length > 0 ? (
                              <div style={csLobbySubtitle()}>
                                {activeCall.peekedParticipants.length}{' '}
                                {activeCall.peekedParticipants.length === 1
                                  ? 'person'
                                  : 'people'}{' '}
                                in call
                              </div>
                            ) : (
                              <div
                                style={{
                                  ...csLobbySubtitle(),
                                  color: 'rgba(255, 255, 255, 0.4)',
                                }}
                              >
                                No one else is in this call yet
                              </div>
                            )}
                            <div style={csCallControlBar()}>
                              <button
                                type="button"
                                onClick={onToggleAudio}
                                style={csCallControlButton(
                                  activeCall.hasLocalAudio
                                )}
                              >
                                <Icon
                                  svg={
                                    activeCall.hasLocalAudio
                                      ? ICONS.mic
                                      : ICONS.micOff
                                  }
                                  size={16}
                                />
                                {activeCall.hasLocalAudio
                                  ? 'Mic On'
                                  : 'Mic Off'}
                              </button>
                              <button
                                type="button"
                                onClick={onToggleVideo}
                                style={csCallControlButton(
                                  activeCall.hasLocalVideo
                                )}
                              >
                                <Icon
                                  svg={
                                    activeCall.hasLocalVideo
                                      ? ICONS.camera
                                      : ICONS.cameraOff
                                  }
                                  size={16}
                                />
                                {activeCall.hasLocalVideo
                                  ? 'Camera On'
                                  : 'Camera Off'}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                startCall({
                                  callMode: activeCall.callMode,
                                  conversationId: activeCall.conversation.id,
                                  hasLocalAudio: activeCall.hasLocalAudio,
                                  hasLocalVideo: activeCall.hasLocalVideo,
                                });
                              }}
                              style={csLobbyJoinButton()}
                            >
                              {activeCall.peekedParticipants.length > 0
                                ? 'Join Meeting'
                                : 'Start Meeting'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : activeCall.callMode === 'Direct' ? (
                      /* ---- Direct call: single participant ---- */
                      <div
                        style={{
                          ...csVideoWell(),
                          ...getMiMoStageSeverityStyle(
                            directStageWorstSeverity
                          ),
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {activeCall.hasRemoteVideo && directConversation ? (
                          <DirectCallRemoteParticipant
                            conversation={directConversation}
                            hasRemoteVideo={activeCall.hasRemoteVideo}
                            handleSize={noopSizeCallback}
                            i18n={i18n}
                            isReconnecting={
                              activeCall.callState === CallState.Reconnecting
                            }
                            setRendererCanvas={setRendererCanvas}
                          />
                        ) : (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              display: 'grid',
                              placeItems: 'center',
                              background:
                                'radial-gradient(ellipse at top, rgba(26, 43, 140, 0.18), rgba(10, 10, 14, 0.97) 65%)',
                            }}
                          >
                            <div
                              ref={localPreviewStageRef}
                              style={{ width: '100%', height: '100%' }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                top: '16px',
                                left: '16px',
                                ...csBadge('neutral'),
                                background: 'rgba(0, 0, 0, 0.5)',
                                color: '#f6f6f6',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                              }}
                            >
                              You (local preview)
                            </div>
                            {directConversation ? (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: '16px',
                                  left: '16px',
                                  padding: '10px 14px',
                                  borderRadius: CS.radiusMd,
                                  background: 'rgba(0, 0, 0, 0.6)',
                                  backdropFilter: 'blur(8px)',
                                  WebkitBackdropFilter: 'blur(8px)',
                                  color: 'rgba(255, 255, 255, 0.8)',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                }}
                              >
                                {directConversation.title} — camera off
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : spotlightedParticipant ? (
                      /* ---- Spotlight mode: large video + compact tile strip ---- */
                      <div style={csSpotlightContainer()}>
                        <div
                          style={{
                            ...csSpotlightMain(),
                            ...getMiMoStageSeverityStyle(
                              spotlightStageWorstSeverity
                            ),
                          }}
                        >
                          <TherapistSpotlightStage
                            audioLevel={
                              activeCall.remoteAudioLevels.get(
                                spotlightedParticipant.demuxId
                              ) ?? 0
                            }
                            getGroupCallVideoFrameSource={
                              getGroupCallVideoFrameSource
                            }
                            i18n={i18n}
                            imageDataCache={imageDataCache}
                            isCallReconnecting={
                              activeCall.connectionState ===
                              GroupConnectionState.Reconnecting
                            }
                            joinedAt={activeCall.joinedAt}
                            participant={spotlightedParticipant}
                            remoteParticipantsCount={
                              activeCall.remoteParticipants.length
                            }
                          />
                          {/* Spotlight header overlay */}
                          <div
                            style={{
                              position: 'absolute',
                              top: '12px',
                              left: '12px',
                              right: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              zIndex: 2,
                            }}
                          >
                            <span
                              style={{
                                ...csBadge('info'),
                                background: 'rgba(0, 0, 0, 0.55)',
                                color: '#f6f6f6',
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                              }}
                            >
                              <Icon svg={ICONS.focus} size={11} />
                              {focusModeSessionId
                                ? `Focus: ${spotlightedParticipant.title}`
                                : spotlightedParticipant.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSpotlightedSessionId(null);
                                if (focusModeSessionId != null) {
                                  setFocusModeSessionId(null);
                                  setLocalAudio({
                                    enabled:
                                      focusModeMediaRestoreRef.current
                                        .hadLocalAudio,
                                  });
                                  setLocalVideo({
                                    enabled:
                                      focusModeMediaRestoreRef.current
                                        .hadLocalVideo,
                                  });
                                }
                              }}
                              style={{
                                border: 'none',
                                borderRadius: CS.radiusFull,
                                padding: '6px 14px',
                                background: 'rgba(0, 0, 0, 0.55)',
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                color: '#f6f6f6',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: CS.fontBody,
                              }}
                            >
                              Show All
                            </button>
                          </div>
                        </div>
                        {/* Compact tile strip — hidden in Focus Mode (no other participant tiles). */}
                        <div style={{ overflow: 'auto', minHeight: 0 }}>
                          {focusModeSessionId ? (
                            <div
                              style={{
                                padding: '14px 16px',
                                margin: '8px',
                                borderRadius: CS.radiusMd,
                                background: CS.infoSoft,
                                color: CS.onSurfaceSecondary,
                                fontSize: '12px',
                                lineHeight: 1.5,
                                fontFamily: CS.fontBody,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  marginBottom: '6px',
                                  fontWeight: 600,
                                  color: CS.onSurface,
                                }}
                              >
                                <Icon
                                  svg={ICONS.focus}
                                  size={14}
                                  color={CS.primary}
                                />
                                Focus mode
                              </div>
                              Other participants’ video is hidden here. Your
                              group mic and camera stay off to avoid
                              broadcasting to everyone.
                              {activeCall.remoteParticipants.length > 1 ? (
                                <div
                                  style={{
                                    marginTop: '8px',
                                    fontSize: '11px',
                                    color: CS.onSurfaceMuted,
                                  }}
                                >
                                  {activeCall.remoteParticipants.length - 1}{' '}
                                  other
                                  {activeCall.remoteParticipants.length === 2
                                    ? ''
                                    : 's'}{' '}
                                  still in this call.
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <TherapistVideoTileGrid
                              compact
                              focusModeSessionId={focusModeSessionId}
                              getGroupCallVideoFrameSource={
                                getGroupCallVideoFrameSource
                              }
                              i18n={i18n}
                              imageDataCache={imageDataCache}
                              isCallReconnecting={
                                activeCall.connectionState ===
                                GroupConnectionState.Reconnecting
                              }
                              joinedAt={activeCall.joinedAt}
                              mimoClients={mimoClients}
                              monitoringQualityMode={monitoringQualityMode}
                              onSelectSession={setSelectedSessionId}
                              onSpotlightSession={id =>
                                setSpotlightedSessionId(
                                  id === spotlightedSessionId ? null : id
                                )
                              }
                              remoteAudioLevels={activeCall.remoteAudioLevels}
                              remoteParticipants={activeCall.remoteParticipants}
                              selectedSessionId={selectedSessionId}
                              setGroupCallVideoRequest={
                                setGroupCallVideoRequest
                              }
                              spotlightedSessionId={spotlightedSessionId}
                            />
                          )}
                        </div>
                      </div>
                    ) : shouldShowStageLocalPreview ? (
                      /* ---- Waiting for participants (local preview) ---- */
                      <div
                        style={{
                          ...csVideoWell(),
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'grid',
                            placeItems: 'center',
                            background:
                              'radial-gradient(ellipse at top, rgba(26, 43, 140, 0.18), rgba(10, 10, 14, 0.97) 65%)',
                          }}
                        >
                          <div
                            ref={localPreviewStageRef}
                            style={{ width: '100%', height: '100%' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: '16px',
                              left: '16px',
                              ...csBadge('neutral'),
                              background: 'rgba(0, 0, 0, 0.5)',
                              color: '#f6f6f6',
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                            }}
                          >
                            You
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ---- 30-session video tile grid (Feature 1) ---- */
                      <TherapistVideoTileGrid
                        focusModeSessionId={focusModeSessionId}
                        getGroupCallVideoFrameSource={
                          getGroupCallVideoFrameSource
                        }
                        i18n={i18n}
                        imageDataCache={imageDataCache}
                        isCallReconnecting={
                          activeCall.connectionState ===
                          GroupConnectionState.Reconnecting
                        }
                        joinedAt={activeCall.joinedAt}
                        mimoClients={mimoClients}
                        monitoringQualityMode={monitoringQualityMode}
                        onSelectSession={setSelectedSessionId}
                        onSpotlightSession={id =>
                          setSpotlightedSessionId(
                            id === spotlightedSessionId ? null : id
                          )
                        }
                        remoteAudioLevels={activeCall.remoteAudioLevels}
                        remoteParticipants={activeCall.remoteParticipants}
                        selectedSessionId={selectedSessionId}
                        setGroupCallVideoRequest={setGroupCallVideoRequest}
                        spotlightedSessionId={spotlightedSessionId}
                      />
                    )}

                    {/* Local preview inset (PIP) */}
                    {isSendingVideo &&
                    !shouldShowStageLocalPreview &&
                    !isGroupCallLobby ? (
                      <div
                        style={{
                          position: 'fixed',
                          right: '340px',
                          bottom: '48px',
                          width: 'min(20vw, 180px)',
                          aspectRatio: '16 / 9',
                          borderRadius: CS.radiusMd,
                          overflow: 'hidden',
                          background: '#111',
                          border: `1px solid rgba(255, 255, 255, 0.08)`,
                          boxShadow: CS.shadow3,
                          zIndex: 10,
                        }}
                      >
                        <div
                          ref={localPreviewInsetRef}
                          style={{ width: '100%', height: '100%' }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            left: '8px',
                            bottom: '8px',
                            ...csBadge('neutral'),
                            background: 'rgba(0, 0, 0, 0.55)',
                            color: '#f6f6f6',
                            fontSize: '10px',
                          }}
                        >
                          You
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* ---- Right sidebar (active call) ---- */}
                <aside
                  style={{
                    ...csAside(),
                    borderLeft: `1px solid ${CS.outlineSubtle}`,
                    padding: '20px 18px',
                  }}
                >
                  {/* ---- My mic / camera ---- */}
                  <div style={{ ...csSectionLabel(), marginBottom: '10px' }}>
                    My Audio &amp; Video
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      marginBottom: '20px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={onToggleAudio}
                      style={{
                        border: 'none',
                        borderRadius: CS.radiusMd,
                        padding: '10px 8px',
                        cursor: 'pointer',
                        fontWeight: 650,
                        fontSize: '12px',
                        fontFamily: CS.fontBody,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: activeCall.hasLocalAudio
                          ? CS.primarySoft
                          : CS.criticalSoft,
                        color: activeCall.hasLocalAudio
                          ? CS.primary
                          : CS.critical,
                        transition: `all ${CS.transitionFast}`,
                      }}
                    >
                      <Icon
                        svg={
                          activeCall.hasLocalAudio ? ICONS.mic : ICONS.micOff
                        }
                        size={14}
                      />
                      {activeCall.hasLocalAudio ? 'Mic On' : 'Mic Off'}
                    </button>
                    <button
                      type="button"
                      onClick={onToggleVideo}
                      style={{
                        border: 'none',
                        borderRadius: CS.radiusMd,
                        padding: '10px 8px',
                        cursor: 'pointer',
                        fontWeight: 650,
                        fontSize: '12px',
                        fontFamily: CS.fontBody,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: activeCall.hasLocalVideo
                          ? CS.primarySoft
                          : CS.surfaceHigh,
                        color: activeCall.hasLocalVideo
                          ? CS.primary
                          : CS.onSurfaceVariant,
                        transition: `all ${CS.transitionFast}`,
                      }}
                    >
                      <Icon
                        svg={
                          activeCall.hasLocalVideo
                            ? ICONS.camera
                            : ICONS.cameraOff
                        }
                        size={14}
                      />
                      {activeCall.hasLocalVideo ? 'Cam On' : 'Cam Off'}
                    </button>
                  </div>

                  {/* Speak control */}
                  <div style={{ ...csSectionLabel(), marginBottom: '10px' }}>
                    {isSingleSessionInterventionMode
                      ? 'Speak to Session'
                      : 'Private Audio'}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      marginBottom: '16px',
                    }}
                  >
                    {isSingleSessionInterventionMode ? (
                      <>
                        <button
                          type="button"
                          onMouseDown={() => {
                            pushToTalkActivatedAudioRef.current =
                              !activeCall.hasLocalAudio;
                            if (pushToTalkActivatedAudioRef.current) {
                              onToggleAudio();
                            }
                            setIsTalkingToSession(true);
                          }}
                          onMouseUp={() => {
                            if (
                              pushToTalkActivatedAudioRef.current &&
                              activeCall.hasLocalAudio
                            ) {
                              onToggleAudio();
                            }
                            pushToTalkActivatedAudioRef.current = false;
                            setIsTalkingToSession(false);
                          }}
                          onMouseLeave={() => {
                            if (
                              isTalkingToSession &&
                              pushToTalkActivatedAudioRef.current &&
                              activeCall.hasLocalAudio
                            ) {
                              onToggleAudio();
                            }
                            pushToTalkActivatedAudioRef.current = false;
                            setIsTalkingToSession(false);
                          }}
                          style={csPushToTalkButton(isTalkingToSession)}
                        >
                          <Icon
                            svg={isTalkingToSession ? ICONS.mic : ICONS.micOff}
                            size={16}
                          />
                          {isTalkingToSession
                            ? `Speaking${selectedSession ? ` to ${selectedSession.title}` : ''}...`
                            : 'Hold to Talk'}
                        </button>
                        {isTalkingToSession ? (
                          <div style={csBannerWarning()}>
                            <Icon svg={ICONS.info} size={14} />
                            {`Your microphone is live${selectedSession ? ` — audio reaches ${selectedSession.title}` : ' for this session'}`}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div style={csBannerWarning()}>
                        <Icon svg={ICONS.info} size={14} />
                        {privateAudioUnavailableMessage}
                      </div>
                    )}
                  </div>

                  {/* Video control */}
                  <div style={{ ...csSectionLabel(), marginBottom: '10px' }}>
                    {isSingleSessionInterventionMode
                      ? 'Send Video to Session'
                      : 'Private Video / Screen'}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      marginBottom: '16px',
                    }}
                  >
                    {isSingleSessionInterventionMode ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onToggleVideo();
                            setIsSendingVideoToSession(
                              !isSendingVideoToSession
                            );
                          }}
                          style={{
                            border: 'none',
                            borderRadius: CS.radiusMd,
                            padding: '10px 14px',
                            fontSize: '12px',
                            fontWeight: 600,
                            fontFamily: CS.fontBody,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: activeCall.hasLocalVideo
                              ? CS.secondarySoft
                              : CS.surfaceLow,
                            color: activeCall.hasLocalVideo
                              ? CS.secondary
                              : CS.onSurfaceVariant,
                            transition: `all ${CS.transitionFast}`,
                            width: '100%',
                          }}
                        >
                          <Icon
                            svg={
                              activeCall.hasLocalVideo
                                ? ICONS.camera
                                : ICONS.cameraOff
                            }
                            size={16}
                          />
                          {activeCall.hasLocalVideo
                            ? 'Camera On'
                            : 'Camera Off'}
                        </button>
                        {activeCall.hasLocalVideo ? (
                          <div style={csBannerWarning()}>
                            <Icon svg={ICONS.info} size={14} />
                            {`Your camera is visible${selectedSession ? ` to ${selectedSession.title}` : ' in this session'}`}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div style={csBannerWarning()}>
                        <Icon svg={ICONS.info} size={14} />
                        {privateVideoUnavailableMessage}
                      </div>
                    )}
                  </div>

                  {/* Other controls */}
                  <div style={{ ...csSectionLabel(), marginBottom: '10px' }}>
                    Session
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: '6px',
                      marginBottom: '24px',
                    }}
                  >
                    {activeCall.callMode !== CallModeValue.Direct ? (
                      <div style={{ ...csCardNested(), padding: '10px 12px' }}>
                        <div
                          style={{
                            color: CS.onSurfaceMuted,
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '8px',
                          }}
                        >
                          Monitoring Quality
                        </div>
                        <div style={{ display: 'grid', gap: '6px' }}>
                          {(
                            [
                              {
                                id: 'balanced',
                                label: 'Balanced',
                                detail: 'Default tile quality',
                              },
                              {
                                id: 'low-fps',
                                label: 'Low FPS',
                                detail:
                                  'Lower frame rate for passive monitoring',
                              },
                              {
                                id: 'thumbnail-only',
                                label: 'Thumbnail Only',
                                detail: 'Aggressive bandwidth savings',
                              },
                            ] as const
                          ).map(option => {
                            const selected =
                              monitoringQualityMode === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() =>
                                  setMonitoringQualityMode(option.id)
                                }
                                style={{
                                  ...csSecondaryButton(),
                                  textAlign: 'left',
                                  width: '100%',
                                  fontSize: '12px',
                                  display: 'grid',
                                  gap: '2px',
                                  padding: '8px 10px',
                                  background: selected
                                    ? CS.primarySoft
                                    : CS.card,
                                  color: selected
                                    ? CS.primary
                                    : CS.onSurfaceSecondary,
                                }}
                              >
                                <span style={{ fontWeight: 650 }}>
                                  {option.label}
                                </span>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: CS.onSurfaceMuted,
                                  }}
                                >
                                  {option.detail}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={onOpenCallControls}
                      style={{
                        ...csSecondaryButton(),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        padding: '9px 14px',
                        width: '100%',
                      }}
                    >
                      <Icon svg={ICONS.system} size={14} />
                      Advanced Controls
                    </button>
                    <button
                      type="button"
                      onClick={onEndCall}
                      style={{
                        border: 'none',
                        borderRadius: CS.radiusMd,
                        padding: '10px 14px',
                        background: CS.criticalSoft,
                        color: CS.critical,
                        cursor: 'pointer',
                        fontWeight: 650,
                        fontSize: '12px',
                        fontFamily: CS.fontBody,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        width: '100%',
                        transition: `all ${CS.transitionFast}`,
                      }}
                    >
                      <Icon svg={ICONS.endCall} size={14} />
                      End Session
                    </button>
                  </div>

                  {/* Remote access */}
                  <div style={{ ...csSectionLabel(), marginBottom: '10px' }}>
                    Remote Access
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: '6px',
                      marginBottom: '24px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        void requestRemoteAccess();
                      }}
                      disabled={
                        remoteAccessBusy ||
                        !selectedMiMoSnapshot?.clientSessionId ||
                        selectedMiMoSnapshot?.rustDeskState === 'requested' ||
                        selectedMiMoSnapshot?.rustDeskState === 'ready'
                      }
                      style={{
                        ...csSecondaryButton(),
                        textAlign: 'left',
                        width: '100%',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        opacity:
                          remoteAccessBusy ||
                          !selectedMiMoSnapshot?.clientSessionId ||
                          selectedMiMoSnapshot?.rustDeskState === 'requested' ||
                          selectedMiMoSnapshot?.rustDeskState === 'ready'
                            ? 0.6
                            : 1,
                        cursor:
                          remoteAccessBusy ||
                          !selectedMiMoSnapshot?.clientSessionId ||
                          selectedMiMoSnapshot?.rustDeskState === 'requested' ||
                          selectedMiMoSnapshot?.rustDeskState === 'ready'
                            ? 'not-allowed'
                            : 'pointer',
                      }}
                    >
                      <Icon svg={ICONS.system} size={14} />
                      {remoteAccessBusy ? 'Requesting...' : 'Request Access'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void endRemoteAccess();
                      }}
                      disabled={
                        remoteAccessBusy ||
                        !selectedMiMoSnapshot?.clientSessionId ||
                        (selectedMiMoSnapshot?.rustDeskState !== 'requested' &&
                          selectedMiMoSnapshot?.rustDeskState !== 'ready')
                      }
                      style={{
                        ...csSecondaryButton(),
                        textAlign: 'left',
                        width: '100%',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        background: CS.criticalSoft,
                        color: CS.critical,
                        opacity:
                          remoteAccessBusy ||
                          !selectedMiMoSnapshot?.clientSessionId ||
                          (selectedMiMoSnapshot?.rustDeskState !==
                            'requested' &&
                            selectedMiMoSnapshot?.rustDeskState !== 'ready')
                            ? 0.6
                            : 1,
                        cursor:
                          remoteAccessBusy ||
                          !selectedMiMoSnapshot?.clientSessionId ||
                          (selectedMiMoSnapshot?.rustDeskState !==
                            'requested' &&
                            selectedMiMoSnapshot?.rustDeskState !== 'ready')
                            ? 'not-allowed'
                            : 'pointer',
                      }}
                    >
                      <Icon svg={ICONS.endCall} size={14} />
                      {remoteAccessBusy ? 'Ending...' : 'End Access'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void copyRustDeskField(
                          'id',
                          selectedMiMoSnapshot?.rustDeskId
                        )
                      }
                      disabled={!selectedMiMoSnapshot?.rustDeskId}
                      style={{
                        ...csSecondaryButton(),
                        textAlign: 'left',
                        width: '100%',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        opacity: selectedMiMoSnapshot?.rustDeskId ? 1 : 0.6,
                        cursor: selectedMiMoSnapshot?.rustDeskId
                          ? 'pointer'
                          : 'not-allowed',
                      }}
                    >
                      <Icon svg={ICONS.copy} size={14} />
                      {copiedRustDeskField === 'id' ? 'Copied ID' : 'Copy ID'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void copyRustDeskField(
                          'password',
                          selectedMiMoSnapshot?.rustDeskPassword
                        )
                      }
                      disabled={!selectedMiMoSnapshot?.rustDeskPassword}
                      style={{
                        ...csSecondaryButton(),
                        textAlign: 'left',
                        width: '100%',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        opacity: selectedMiMoSnapshot?.rustDeskPassword
                          ? 1
                          : 0.6,
                        cursor: selectedMiMoSnapshot?.rustDeskPassword
                          ? 'pointer'
                          : 'not-allowed',
                      }}
                    >
                      <Icon svg={ICONS.copy} size={14} />
                      {copiedRustDeskField === 'password'
                        ? 'Copied Password'
                        : 'Copy Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void openRustDesk();
                      }}
                      style={{
                        ...csSecondaryButton(),
                        textAlign: 'left',
                        width: '100%',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                      }}
                    >
                      <Icon svg={ICONS.devices} size={14} />
                      Open RustDesk
                    </button>
                    {remoteAccessError ? (
                      <div style={{ ...csBannerWarning(), fontSize: '12px' }}>
                        <Icon svg={ICONS.info} size={14} />
                        {remoteAccessError}
                      </div>
                    ) : null}
                    <div
                      style={{
                        ...csCardNested(),
                        padding: '10px 12px',
                        fontSize: '12px',
                      }}
                    >
                      <div
                        style={{
                          color: CS.onSurfaceMuted,
                          marginBottom: '4px',
                        }}
                      >
                        RustDesk state
                      </div>
                      <div
                        style={{
                          color: CS.onSurface,
                          fontWeight: 650,
                          marginBottom: '8px',
                        }}
                      >
                        {selectedMiMoSnapshot
                          ? selectedMiMoSnapshot.rustDeskState
                          : 'Unavailable'}
                      </div>
                      <div
                        style={{
                          color: CS.onSurfaceMuted,
                          marginBottom: '2px',
                        }}
                      >
                        ID: {selectedMiMoSnapshot?.rustDeskId ?? 'Not issued'}
                      </div>
                      <div
                        style={{
                          color: CS.onSurfaceMuted,
                          marginBottom: '2px',
                        }}
                      >
                        Password:{' '}
                        {showRustDeskPassword
                          ? (selectedMiMoSnapshot?.rustDeskPassword ??
                            'Not available')
                          : maskSecret(
                              selectedMiMoSnapshot?.rustDeskPassword ?? null
                            )}
                      </div>
                      <div
                        style={{
                          color: CS.onSurfaceMuted,
                          marginBottom: '8px',
                        }}
                      >
                        Expires:{' '}
                        {formatRustDeskExpiry(
                          selectedMiMoSnapshot?.rustDeskExpiresAtUnixMs ?? null
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowRustDeskPassword(value => !value)}
                        disabled={!selectedMiMoSnapshot?.rustDeskPassword}
                        style={{
                          ...csSecondaryButton(),
                          width: '100%',
                          fontSize: '11px',
                          padding: '8px 10px',
                          opacity: selectedMiMoSnapshot?.rustDeskPassword
                            ? 1
                            : 0.6,
                          cursor: selectedMiMoSnapshot?.rustDeskPassword
                            ? 'pointer'
                            : 'not-allowed',
                        }}
                      >
                        {showRustDeskPassword
                          ? 'Hide Password'
                          : 'Reveal Password'}
                      </button>
                    </div>
                  </div>

                  {/* Session alerts — cleaner card-less design */}
                  <div style={{ ...csSectionLabel(), marginBottom: '10px' }}>
                    Session Alerts
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: '6px',
                      marginBottom: '24px',
                    }}
                  >
                    {callAlertsForSessionPanel.length > 0 ? (
                      callAlertsForSessionPanel.map(cue => (
                        <div
                          key={`${cue.label}-${cue.detail}`}
                          style={{
                            padding: '10px 14px',
                            borderRadius: CS.radiusMd,
                            background:
                              cue.tone === 'good'
                                ? CS.successSoft
                                : cue.tone === 'warning'
                                  ? CS.warningSoft
                                  : cue.tone === 'critical'
                                    ? CS.criticalSoft
                                    : CS.infoSoft,
                            border: 'none',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginBottom: '3px',
                            }}
                          >
                            <span
                              style={{
                                ...csBadge(getToneName(cue.tone)),
                                padding: '2px 8px',
                                fontSize: '10px',
                              }}
                            >
                              {cue.label}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              lineHeight: 1.5,
                              color: CS.onSurfaceSecondary,
                            }}
                          >
                            {cue.detail}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          fontSize: '12px',
                          color: CS.onSurfaceMuted,
                          padding: '6px 0',
                        }}
                      >
                        All clear — no alerts.
                      </div>
                    )}
                  </div>

                  {/* Session detail */}
                  {selectedSession ? (
                    <>
                      {/* Participant header with avatar */}
                      <div
                        style={{
                          ...getToneCardAccentStyle(selectedSession.tone),
                          borderRadius: CS.radiusMd,
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          marginBottom: '18px',
                        }}
                      >
                        <AvatarCircle name={selectedSession.title} size={40} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              color: CS.onSurface,
                              fontFamily: CS.fontDisplay,
                            }}
                          >
                            {selectedSession.title}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: CS.onSurfaceMuted,
                              marginTop: '2px',
                            }}
                          >
                            {selectedSession.subtitle} ·{' '}
                            {selectedSession.status}
                          </div>
                        </div>
                      </div>

                      {/* Focus + Actions — combined for less sections */}
                      {activeCall.callMode !== CallModeValue.Direct ||
                      selectedLiveParticipant ? (
                        <>
                          <div
                            style={{ ...csSectionLabel(), marginBottom: '8px' }}
                          >
                            Quick Actions
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gap: '6px',
                              marginBottom: '20px',
                            }}
                          >
                            {activeCall.callMode !== CallModeValue.Direct ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setSpotlightedSessionId(
                                    isSelectedSessionSpotlighted
                                      ? null
                                      : selectedSession.id
                                  )
                                }
                                style={{
                                  ...csSecondaryButton(),
                                  textAlign: 'left',
                                  width: '100%',
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '10px 14px',
                                  background: isSelectedSessionSpotlighted
                                    ? CS.primarySoft
                                    : CS.card,
                                }}
                              >
                                <Icon
                                  svg={ICONS.focus}
                                  size={14}
                                  color={
                                    isSelectedSessionSpotlighted
                                      ? CS.primary
                                      : CS.onSurfaceVariant
                                  }
                                />
                                {isSelectedSessionSpotlighted
                                  ? 'Show all participants'
                                  : `Spotlight ${selectedSession.title}`}
                              </button>
                            ) : null}
                            {activeCall.callMode !== CallModeValue.Direct ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isSelectedSessionFocusMode) {
                                    exitFocusMode();
                                    setSpotlightedSessionId(null);
                                  } else {
                                    enterFocusMode();
                                  }
                                }}
                                style={{
                                  ...csSecondaryButton(),
                                  textAlign: 'left',
                                  width: '100%',
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '10px 14px',
                                  background: isSelectedSessionFocusMode
                                    ? CS.primarySoft
                                    : CS.card,
                                }}
                              >
                                <Icon
                                  svg={ICONS.focus}
                                  size={14}
                                  color={
                                    isSelectedSessionFocusMode
                                      ? CS.primary
                                      : CS.onSurfaceVariant
                                  }
                                />
                                {isSelectedSessionFocusMode
                                  ? `Exit focus mode (${selectedSession.title})`
                                  : `Focus mode — ${selectedSession.title}`}
                              </button>
                            ) : null}
                            {activeCall.callMode !== CallModeValue.Direct &&
                            onBreakoutToOneToOne ? (
                              <button
                                type="button"
                                disabled={
                                  breakoutBusy ||
                                  !selectedInterventionConversation ||
                                  !selectedInterventionConversation.serviceId
                                }
                                onClick={() => {
                                  if (
                                    breakoutBusy ||
                                    !selectedInterventionConversation ||
                                    !selectedInterventionConversation.serviceId ||
                                    !onBreakoutToOneToOne
                                  ) {
                                    return;
                                  }
                                  if (
                                    !window.confirm(
                                      `Leave this multi-party call and start a 1:1 video call with ${selectedInterventionTargetTitle}? You can rejoin the group or meeting afterward from this console.`
                                    )
                                  ) {
                                    return;
                                  }
                                  onBreakoutToOneToOne(
                                    selectedInterventionConversation.id,
                                    selectedInterventionConversation.serviceId
                                  );
                                }}
                                style={{
                                  ...csSecondaryButton(),
                                  textAlign: 'left',
                                  width: '100%',
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '10px 14px',
                                  background: CS.primarySoft,
                                  opacity: breakoutBusy ? 0.65 : 1,
                                  cursor:
                                    breakoutBusy ||
                                    !selectedInterventionConversation ||
                                    !selectedInterventionConversation.serviceId
                                      ? 'not-allowed'
                                      : 'pointer',
                                }}
                                title={
                                  selectedInterventionConversation?.serviceId
                                    ? undefined
                                    : 'Direct 1:1 requires a linked Signal service id for this participant.'
                                }
                              >
                                <Icon
                                  svg={ICONS.pulse}
                                  size={14}
                                  color={CS.primary}
                                />
                                {breakoutBusy
                                  ? 'Starting 1:1 session…'
                                  : selectedInterventionConversation
                                    ? `1:1 session with ${selectedInterventionTargetTitle}`
                                    : '1:1 session unavailable'}
                              </button>
                            ) : null}
                            {selectedLiveParticipant ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRemoteMute(
                                      selectedLiveParticipant.demuxId
                                    )
                                  }
                                  style={{
                                    border: 'none',
                                    borderRadius: CS.radiusMd,
                                    padding: '10px 14px',
                                    background: CS.warningSoft,
                                    color: CS.warning,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '12px',
                                    fontFamily: CS.fontBody,
                                    textAlign: 'left',
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: `all ${CS.transitionFast}`,
                                  }}
                                >
                                  <Icon svg={ICONS.mute} size={14} />
                                  Mute participant
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRemoveParticipant(
                                      selectedLiveParticipant.demuxId
                                    )
                                  }
                                  style={{
                                    border: 'none',
                                    borderRadius: CS.radiusMd,
                                    padding: '10px 14px',
                                    background: CS.criticalSoft,
                                    color: CS.critical,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '12px',
                                    fontFamily: CS.fontBody,
                                    textAlign: 'left',
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: `all ${CS.transitionFast}`,
                                  }}
                                >
                                  <Icon svg={ICONS.userRemove} size={14} />
                                  Remove from session
                                </button>
                              </>
                            ) : null}
                          </div>
                        </>
                      ) : null}

                      {/* Session detail — cleaner metric tiles */}
                      <div style={{ ...csSectionLabel(), marginBottom: '8px' }}>
                        Details
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gap: '5px',
                          marginBottom: '20px',
                        }}
                      >
                        {selectedSession.rows.map(([label, value]) => (
                          <div
                            key={label}
                            style={{ ...csMetricTile(), padding: '10px 14px' }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: CS.onSurfaceMuted,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {label}
                              </div>
                              <div
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 650,
                                  color: CS.onSurface,
                                  fontFamily: CS.fontDisplay,
                                }}
                              >
                                {value}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Participant signals */}
                      {selectedSession.cues.length > 0 ? (
                        <>
                          <div
                            style={{ ...csSectionLabel(), marginBottom: '8px' }}
                          >
                            Signals
                          </div>
                          <div style={{ display: 'grid', gap: '6px' }}>
                            {selectedSession.cues.map(cue => (
                              <div
                                key={`${selectedSession.id}-${cue.label}`}
                                style={{
                                  padding: '10px 14px',
                                  borderRadius: CS.radiusMd,
                                  background:
                                    cue.tone === 'good'
                                      ? CS.successSoft
                                      : cue.tone === 'warning'
                                        ? CS.warningSoft
                                        : cue.tone === 'critical'
                                          ? CS.criticalSoft
                                          : CS.infoSoft,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    marginBottom: '2px',
                                  }}
                                >
                                  <span
                                    style={{
                                      ...csBadge(getToneName(cue.tone)),
                                      padding: '2px 8px',
                                      fontSize: '10px',
                                    }}
                                  >
                                    {cue.label}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: '12px',
                                    lineHeight: 1.5,
                                    color: CS.onSurfaceSecondary,
                                  }}
                                >
                                  {cue.detail}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}

                      {/* Pending participants — cleaner approval UX */}
                      {pendingParticipants.length > 0 ? (
                        <>
                          <div
                            style={{
                              ...csSectionLabel(),
                              marginTop: '20px',
                              marginBottom: '10px',
                            }}
                          >
                            Waiting to Join ({pendingParticipants.length})
                          </div>
                          <div style={{ display: 'grid', gap: '8px' }}>
                            {pendingParticipants.map(participant => (
                              <div
                                key={participant.id}
                                style={{
                                  padding: '14px 16px',
                                  borderRadius: CS.radiusMd,
                                  background: CS.warningSoft,
                                  border: `1px solid rgba(184, 112, 14, 0.10)`,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    marginBottom: '10px',
                                  }}
                                >
                                  <AvatarCircle
                                    name={participant.title}
                                    size={32}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div
                                      style={{
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        color: CS.onSurface,
                                        fontFamily: CS.fontDisplay,
                                      }}
                                    >
                                      {participant.title}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '11px',
                                        color: CS.onSurfaceMuted,
                                      }}
                                    >
                                      Requesting to join
                                    </div>
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                      'repeat(2, minmax(0, 1fr))',
                                    gap: '6px',
                                  }}
                                >
                                  <button
                                    type="button"
                                    disabled={!participant.serviceId}
                                    onClick={() =>
                                      onApprovePendingParticipant(
                                        participant.serviceId
                                      )
                                    }
                                    style={{
                                      border: 'none',
                                      borderRadius: CS.radiusMd,
                                      padding: '8px 12px',
                                      background: participant.serviceId
                                        ? CS.successSoft
                                        : CS.surfaceHigh,
                                      color: participant.serviceId
                                        ? CS.success
                                        : CS.onSurfaceMuted,
                                      cursor: participant.serviceId
                                        ? 'pointer'
                                        : 'not-allowed',
                                      fontWeight: 650,
                                      fontSize: '12px',
                                      fontFamily: CS.fontBody,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '5px',
                                      transition: `all ${CS.transitionFast}`,
                                    }}
                                  >
                                    <Icon svg={ICONS.check} size={13} />
                                    Admit
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!participant.serviceId}
                                    onClick={() =>
                                      onDenyPendingParticipant(
                                        participant.serviceId
                                      )
                                    }
                                    style={{
                                      border: 'none',
                                      borderRadius: CS.radiusMd,
                                      padding: '8px 12px',
                                      background: participant.serviceId
                                        ? CS.criticalSoft
                                        : CS.surfaceHigh,
                                      color: participant.serviceId
                                        ? CS.critical
                                        : CS.onSurfaceMuted,
                                      cursor: participant.serviceId
                                        ? 'pointer'
                                        : 'not-allowed',
                                      fontWeight: 650,
                                      fontSize: '12px',
                                      fontFamily: CS.fontBody,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '5px',
                                      transition: `all ${CS.transitionFast}`,
                                    }}
                                  >
                                    <Icon svg={ICONS.deny} size={13} />
                                    Deny
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        padding: '32px 16px',
                      }}
                    >
                      {pendingParticipants.length === 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: 1,
                            textAlign: 'center',
                          }}
                        >
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              background: CS.surfaceHigh,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginBottom: '12px',
                            }}
                          >
                            <Icon
                              svg={ICONS.users}
                              size={18}
                              color={CS.onSurfaceMuted}
                            />
                          </div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '13px',
                              fontWeight: 600,
                              color: CS.onSurfaceSecondary,
                              marginBottom: '4px',
                            }}
                          >
                            No participant selected
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '12px',
                              color: CS.onSurfaceMuted,
                            }}
                          >
                            Click a participant tile to view details.
                          </p>
                        </div>
                      ) : null}

                      {/* Pending participants — visible even with no session selected */}
                      {pendingParticipants.length > 0 ? (
                        <>
                          <div
                            style={{
                              ...csSectionLabel(),
                              marginBottom: '10px',
                            }}
                          >
                            Waiting to Join ({pendingParticipants.length})
                          </div>
                          <div style={{ display: 'grid', gap: '8px' }}>
                            {pendingParticipants.map(participant => (
                              <div
                                key={participant.id}
                                style={{
                                  padding: '14px 16px',
                                  borderRadius: CS.radiusMd,
                                  background: CS.warningSoft,
                                  border: `1px solid rgba(184, 112, 14, 0.10)`,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    marginBottom: '10px',
                                  }}
                                >
                                  <AvatarCircle
                                    name={participant.title}
                                    size={32}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div
                                      style={{
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        color: CS.onSurface,
                                        fontFamily: CS.fontDisplay,
                                      }}
                                    >
                                      {participant.title}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '11px',
                                        color: CS.onSurfaceMuted,
                                      }}
                                    >
                                      Requesting to join
                                    </div>
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                      'repeat(2, minmax(0, 1fr))',
                                    gap: '6px',
                                  }}
                                >
                                  <button
                                    type="button"
                                    disabled={!participant.serviceId}
                                    onClick={() =>
                                      onApprovePendingParticipant(
                                        participant.serviceId
                                      )
                                    }
                                    style={{
                                      border: 'none',
                                      borderRadius: CS.radiusMd,
                                      padding: '8px 12px',
                                      background: participant.serviceId
                                        ? CS.successSoft
                                        : CS.surfaceHigh,
                                      color: participant.serviceId
                                        ? CS.success
                                        : CS.onSurfaceMuted,
                                      cursor: participant.serviceId
                                        ? 'pointer'
                                        : 'not-allowed',
                                      fontWeight: 650,
                                      fontSize: '12px',
                                      fontFamily: CS.fontBody,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '5px',
                                      transition: `all ${CS.transitionFast}`,
                                    }}
                                  >
                                    <Icon svg={ICONS.check} size={13} />
                                    Admit
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!participant.serviceId}
                                    onClick={() =>
                                      onDenyPendingParticipant(
                                        participant.serviceId
                                      )
                                    }
                                    style={{
                                      border: 'none',
                                      borderRadius: CS.radiusMd,
                                      padding: '8px 12px',
                                      background: participant.serviceId
                                        ? CS.criticalSoft
                                        : CS.surfaceHigh,
                                      color: participant.serviceId
                                        ? CS.critical
                                        : CS.onSurfaceMuted,
                                      cursor: participant.serviceId
                                        ? 'pointer'
                                        : 'not-allowed',
                                      fontWeight: 650,
                                      fontSize: '12px',
                                      fontFamily: CS.fontBody,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '5px',
                                      transition: `all ${CS.transitionFast}`,
                                    }}
                                  >
                                    <Icon svg={ICONS.deny} size={13} />
                                    Deny
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </aside>
              </div>
              ) : (
              /* Non-workspace tab content shown during active call */
              <div style={{ ...csMainColumn(), overflow: 'auto' }}>
                <div
                  style={{
                    ...csBannerInfo(),
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <Icon svg={ICONS.pulse} size={14} />
                  <span>Session is still active.</span>
                  <button
                    type="button"
                    onClick={() => setActiveShellTab('workspace')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: CS.primary,
                      cursor: 'pointer',
                      fontWeight: 650,
                      padding: 0,
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      textDecoration: 'underline',
                    }}
                  >
                    Back to Session
                  </button>
                </div>

                {/* =========== CHATS TAB (during active call) =========== */}
                {activeShellTab === 'chats' ? (
                  <div style={{ display: 'grid', gap: '16px', minHeight: 0 }}>
                    <div>
                      <h2
                        style={{ ...csWorkspaceTitle(), marginBottom: '4px' }}
                      >
                        Messages
                      </h2>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '13px',
                          color: CS.onSurfaceMuted,
                        }}
                      >
                        Send messages during the session.
                      </p>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '240px minmax(0, 1fr)',
                        gap: '16px',
                        minHeight: 0,
                        height: 'min(65vh, 680px)',
                      }}
                    >
                      <div
                        style={{
                          ...csCard(),
                          overflow: 'auto',
                          padding: '14px',
                        }}
                      >
                        <div
                          style={{
                            ...csSectionLabel(),
                            marginBottom: '10px',
                          }}
                        >
                          Conversations
                        </div>
                        <div style={{ display: 'grid', gap: '4px' }}>
                          {launchableConversations.length ? (
                            launchableConversations.map(conversation => {
                              const isSelectedConvo =
                                selectedLaunchConversationId ===
                                conversation.id;
                              return (
                                <button
                                  key={conversation.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedLaunchConversationId(
                                      conversation.id
                                    )
                                  }
                                  style={{
                                    ...csConversationRow(isSelectedConvo),
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                  }}
                                >
                                  <AvatarCircle
                                    name={conversation.title}
                                    size={28}
                                  />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div
                                      style={{
                                        fontWeight: 600,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        fontSize: '13px',
                                      }}
                                    >
                                      {conversation.title}
                                    </div>
                                    <div
                                      style={{
                                        color: CS.onSurfaceMuted,
                                        fontSize: '11px',
                                      }}
                                    >
                                      {conversation.type === 'group'
                                        ? 'Group'
                                        : 'Direct'}
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div
                              style={{
                                ...csDisplayMuted(),
                                fontSize: '13px',
                              }}
                            >
                              No conversations available.
                            </div>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          ...csCard(),
                          overflow: 'hidden',
                          padding: 0,
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {selectedLaunchConversation ? (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateRows: 'minmax(0, 1fr) auto',
                              minHeight: 0,
                              height: '100%',
                              width: '100%',
                            }}
                          >
                            <div style={{ minHeight: 0 }}>
                              <SmartTimeline
                                id={selectedLaunchConversation.id}
                              />
                            </div>
                            <div
                              style={{
                                borderTop: `1px solid ${CS.outlineSubtle}`,
                              }}
                            >
                              <SmartCompositionArea
                                id={selectedLaunchConversation.id}
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flex: 1,
                              textAlign: 'center',
                              padding: '32px',
                            }}
                          >
                            <div
                              style={{
                                ...csDisplayMuted(),
                                fontSize: '14px',
                                fontWeight: 600,
                                marginBottom: '6px',
                              }}
                            >
                              No conversation selected
                            </div>
                            <div
                              style={{
                                fontSize: '12px',
                                color: CS.onSurfaceMuted,
                              }}
                            >
                              Choose a client from the list to view messages.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              )}
            </div>
            )}
          </section>
        </div>
      </ModalContainer>
      {addGroupMembersModalNode}
      {createNewGroupWizardNode}
    </>
  );
}
