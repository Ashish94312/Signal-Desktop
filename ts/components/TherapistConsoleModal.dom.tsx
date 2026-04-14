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
import type { LocalizerType } from '../types/Util.std.ts';
import type {
  SetRendererCanvasType,
  StartCallType,
} from '../state/ducks/calling.preload.ts';
import type { CallMode } from '../types/CallDisposition.std.ts';
import { CallMode as CallModeValue } from '../types/CallDisposition.std.ts';
import type { SetLocalPreviewContainerType } from '../services/calling.preload.ts';
import type {
  ConversationType,
  ShowConversationType,
} from '../state/ducks/conversations.preload.ts';
import type { StateType } from '../state/reducer.preload.ts';
import type { MiMoClientSnapshotType } from '../types/MiMoMetadata.std.ts';
import {
  findMiMoCallMatch,
  findMiMoSnapshotForSessionTile,
} from '../util/mimoSessionCorrelation.std.ts';
import type { SavedMultiPartyContext } from '../types/TherapistBreakout.std.ts';
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
import { NeedsScreenRecordingPermissionsModal } from './NeedsScreenRecordingPermissionsModal.dom.tsx';
import { SmartTimeline } from '../state/smart/Timeline.preload.tsx';
import { SmartCompositionArea } from '../state/smart/CompositionArea.preload.tsx';
import {
  approveRemoteSupportRequest,
  declineRemoteSupportRequest,
  endRemoteSupportSession,
  getRemoteSupportState,
  resetRemoteSupportError,
  subscribeRemoteSupport,
  type RemoteSupportState,
} from '../services/remoteSupportController.preload.ts';
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

// Below `$z-index-modal-host` (102) in stylesheets/_variables.scss so `ModalHost`
// portaled to `document.body` (choose members, add members, group metadata) stacks
// above this shell.
const THERAPIST_CONSOLE_SHELL_Z_INDEX = 101;

/** Participant client: hide operator-only New Group / Add Members (see project brief). */
const SHOW_GROUP_MANAGEMENT_IN_SESSION_CONSOLE = false;
const MIMO_ACTIVITY_STALE_AFTER_MS = 60_000;
const MIMO_ACTIVITY_ARCHIVE_AFTER_MS = 5 * 60_000;

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
  onToggleAudio: () => void;
  onUpdateCallLinkName: (roomId: string, name: string) => void;
  onToggleVideo: () => void;
  getPresentingSources: () => void;
  openSystemPreferencesAction: () => unknown;
  cancelPresenting: () => void;
  toggleScreenRecordingPermissionsDialog: () => unknown;
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

function mimoClientsToAlertCues(
  clients: Record<string, MiMoClientSnapshotType>
): Array<ConsoleCue> {
  const out: Array<ConsoleCue> = [];
  for (const client of Object.values(clients)) {
    for (const alert of client.alerts) {
      const tone: CueTone =
        alert.severity === 'red'
          ? 'critical'
          : alert.severity === 'yellow'
            ? 'warning'
            : 'good';
      out.push({
        label: `MiMo · ${alert.type}`,
        detail: alert.message,
        tone,
      });
    }
  }
  return out;
}

/** Priority rank (higher = more urgent) — aligned with mimo-remote-therapy TherapistConsole. */
function getMimoClientPriority(client: MiMoClientSnapshotType): number {
  const alertScore = client.alerts.reduce((maxScore, alert) => {
    const score =
      alert.severity === 'red' ? 30 : alert.severity === 'yellow' ? 20 : 10;
    return Math.max(maxScore, score);
  }, 0);

  const connectivityScore =
    client.connectivityState === 'offline'
      ? 25
      : client.connectivityState === 'reconnecting'
        ? 15
        : 0;
  const sessionScore =
    client.sessionStatus === 'ended'
      ? 5
      : client.sessionStatus === 'paused'
        ? 10
        : client.sessionStatus === 'active'
          ? 0
          : 3;

  return alertScore + connectivityScore + sessionScore;
}

function formatRelativeTimeForMimoAlert(timestampMs: number): string {
  const ts = normalizeTimestamp(timestampMs);
  const deltaMs = Date.now() - ts;
  const deltaSeconds = Math.max(0, Math.round(deltaMs / 1000));

  if (deltaSeconds < 5) {
    return 'Just now';
  }
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  return `${deltaHours}h ago`;
}

function toTitleCaseMimo(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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

function formatExpiry(value: number | null): string {
  if (!value) {
    return 'Not set';
  }
  const deltaMs = value - Date.now();
  if (deltaMs <= 0) {
    return 'Expired';
  }
  const deltaMinutes = Math.max(1, Math.round(deltaMs / 60_000));
  return `in ${deltaMinutes}m`;
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
  getPresentingSources,
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
  cancelPresenting,
  openSystemPreferencesAction,
  toggleScreenRecordingPermissionsDialog,
}: PropsType): React.JSX.Element {
  const imageDataCache = useRef<CallingImageDataCache | null>(new Map());
  const localPreviewInsetRef = useRef<HTMLDivElement | null>(null);
  const localPreviewStageRef = useRef<HTMLDivElement | null>(null);
  const pushToTalkActivatedAudioRef = useRef(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [spotlightedSessionId, setSpotlightedSessionId] = useState<
    string | null
  >(null);
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
  const [editingCallLinkRoomId, setEditingCallLinkRoomId] = useState<
    string | null
  >(null);
  const [editingCallLinkName, setEditingCallLinkName] = useState('');
  const [isActivityMonitorCollapsed, setIsActivityMonitorCollapsed] =
    useState(false);
  const [remoteSupportState, setRemoteSupportState] =
    useState<RemoteSupportState>(getRemoteSupportState());
  const [showRemoteSupportPassword, setShowRemoteSupportPassword] =
    useState(false);
  const [copiedRemoteField, setCopiedRemoteField] = useState<
    'id' | 'password' | null
  >(null);
  const [remoteSupportBusyAction, setRemoteSupportBusyAction] = useState<
    'approve' | 'decline' | 'end' | null
  >(null);

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

  const mimoClientList = useMemo(() => {
    const list = Object.values(mimoClients)
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
      }));
    return [...list].sort(
      (a, b) => getMimoClientPriority(b) - getMimoClientPriority(a)
    );
  }, [activityMonitorNow, mimoClients]);

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

  useEffect(() => {
    return subscribeRemoteSupport(() => {
      setRemoteSupportState(getRemoteSupportState());
    });
  }, []);

  useEffect(() => {
    setShowRemoteSupportPassword(false);
    setCopiedRemoteField(null);
    setRemoteSupportBusyAction(null);
  }, [remoteSupportState.therapistSessionId]);

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

  const copyRemoteSupportField = useCallback(
    async (field: 'id' | 'password', value: string | null) => {
      if (!value) {
        return;
      }
      try {
        if (window.SignalClipboard?.copyTextTemporarily) {
          window.SignalClipboard.copyTextTemporarily(value, 60_000);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        }
      } catch {
        return;
      }

      setCopiedRemoteField(field);
      setTimeout(() => {
        setCopiedRemoteField(current => (current === field ? null : current));
      }, 1500);
    },
    []
  );

  const onApproveRemoteSupport = useCallback(async () => {
    setRemoteSupportBusyAction('approve');
    resetRemoteSupportError();
    try {
      await approveRemoteSupportRequest();
    } finally {
      setRemoteSupportBusyAction(null);
    }
  }, []);

  const onDeclineRemoteSupport = useCallback(async () => {
    setRemoteSupportBusyAction('decline');
    resetRemoteSupportError();
    try {
      await declineRemoteSupportRequest();
    } finally {
      setRemoteSupportBusyAction(null);
    }
  }, []);

  const onEndRemoteSupport = useCallback(async () => {
    setRemoteSupportBusyAction('end');
    resetRemoteSupportError();
    try {
      await endRemoteSupportSession();
    } finally {
      setRemoteSupportBusyAction(null);
    }
  }, []);

  const onOpenRustDesk = useCallback(async () => {
    resetRemoteSupportError();
    try {
      await window.IPC.openExternalUrl('rustdesk://');
    } catch {
      // keep UI stable if protocol launch is blocked
    }
  }, []);

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
    const mimoCues = mimoClientsToAlertCues(mimoClients);

    if (!activeCall) {
      return mimoCues;
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

      return [...cues, ...mimoCues];
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

    return [...cues, ...mimoCues];
  }, [activeCall, mimoClients]);

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

    return activeCall.remoteParticipants.map(participant => {
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
        cues.push({ label: 'Activity', detail: 'Speaking now.', tone: 'good' });
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

      return {
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
        tone: getStrongestTone(cues),
      };
    });
  }, [activeCall]);

  useEffect(() => {
    if (!sessions.length) {
      if (selectedSessionId !== null) {
        setSelectedSessionId(null);
      }
      if (spotlightedSessionId !== null) {
        setSpotlightedSessionId(null);
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
  }, [selectedSessionId, sessions, spotlightedSessionId]);

  const selectedSession =
    sessions.find(session => session.id === selectedSessionId) ?? sessions[0];

  const selectedMimoSnapshot = useMemo(
    () =>
      selectedSession?.id
        ? findMiMoSnapshotForSessionTile(
            mimoClients,
            activeCall,
            selectedSession.id
          )
        : undefined,
    [activeCall, mimoClients, selectedSession?.id]
  );

  const spotlightedParticipant =
    activeCall?.callMode === CallModeValue.Direct
      ? undefined
      : activeCall?.remoteParticipants.find(
          participant => String(participant.demuxId) === spotlightedSessionId
        );

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
  const privateAudioUnavailableMessage = selectedInterventionConversation
    ? `A direct Signal conversation exists with ${selectedInterventionTargetTitle}, but the current calling stack cannot keep the group call live and privately route therapist audio to one client only.`
    : selectedSession
      ? 'Select a participant with a linked direct Signal conversation. Private audio while staying inside the group call still needs a separate sidecar media channel.'
      : 'Select a participant tile. Private audio is not available while the group call stays active in this build.';
  const privateVideoUnavailableMessage = selectedInterventionConversation
    ? `A direct Signal conversation exists with ${selectedInterventionTargetTitle}, but camera and screen share are still sent at the group-call level in this build.`
    : selectedSession
      ? 'Select a participant with a linked direct Signal conversation. Private camera and screen share still need a separate sidecar media channel.'
      : 'Select a participant tile. Private camera and screen share are not available while the group call stays active in this build.';

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
  const isSingleSessionInterventionMode =
    activeCall?.callMode === CallModeValue.Direct;

  const remoteScreenSharingParticipant =
    activeCall?.remoteParticipants.find(p => p.presenting) ?? undefined;

  const canTogglePresenting =
    activeCall != null &&
    (activeCall.callMode === CallModeValue.Direct
      ? activeCall.callState === CallState.Accepted
      : activeCall.joinState === GroupJoinState.Joined);

  const togglePresenting = useCallback(() => {
    if (!activeCall) {
      return;
    }
    if (activeCall.presentingSource) {
      cancelPresenting();
    } else {
      getPresentingSources();
    }
  }, [activeCall, cancelPresenting, getPresentingSources]);

  // Direct calls: session console does not render remote video; detach any canvas
  // so RingRTC does not keep drawing to a removed element.
  useEffect(() => {
    if (activeCall?.callMode !== CallModeValue.Direct) {
      return;
    }
    setRendererCanvas({ element: undefined, sizeCallback: undefined });
    return () => {
      setRendererCanvas({ element: undefined, sizeCallback: undefined });
    };
  }, [activeCall?.callMode, setRendererCanvas]);

  // ====================================================================
  // RENDER: MiMo metadata panel
  // ====================================================================

  const mimoMetadataPanel = useMemo(() => {
    const totalMimoAlerts = mimoClientList.reduce(
      (sum, c) => sum + c.alerts.length,
      0
    );

    return (
      <div style={csMiMoPanel()}>
        <div
          style={{
            ...csSectionLabel(),
            marginBottom: isActivityMonitorCollapsed ? 0 : '10px',
            color: CS.secondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
              minWidth: 0,
            }}
          >
            <Icon svg={ICONS.pulse} size={14} color={CS.secondary} />
            Activity Monitor
            {totalMimoAlerts > 0 ? (
              <span
                style={{
                  ...csBadge('neutral'),
                  padding: '2px 8px',
                  fontSize: '10px',
                }}
              >
                {totalMimoAlerts} alert{totalMimoAlerts === 1 ? '' : 's'} live
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setIsActivityMonitorCollapsed(c => !c)}
            aria-expanded={!isActivityMonitorCollapsed}
            aria-label={
              isActivityMonitorCollapsed
                ? 'Show Activity Monitor and Alert Rail'
                : 'Hide Activity Monitor and Alert Rail'
            }
            title={
              isActivityMonitorCollapsed
                ? 'Show Activity Monitor and Alert Rail'
                : 'Hide Activity Monitor to enlarge video'
            }
            style={{
              ...csSecondaryButton(),
              flexShrink: 0,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                transform: isActivityMonitorCollapsed
                  ? 'rotate(90deg)'
                  : 'rotate(-90deg)',
                transition: `transform ${CS.transitionFast}`,
              }}
              aria-hidden
            >
              <Icon svg={ICONS.chevronRight} size={14} color={CS.secondary} />
            </span>
            {isActivityMonitorCollapsed ? 'Show' : 'Hide'}
          </button>
        </div>
        {!isActivityMonitorCollapsed ? (
          <>
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
                  const hasRed = client.alerts.some(a => a.severity === 'red');
                  const hasYellow = client.alerts.some(
                    a => a.severity === 'yellow'
                  );
                  const dotColor = hasRed
                    ? CS.critical
                    : hasYellow
                      ? CS.warning
                      : match.kind === 'participant'
                        ? CS.success
                        : CS.warning;
                  const rail = hasRed
                    ? CS.critical
                    : hasYellow
                      ? CS.warning
                      : 'transparent';

                  return (
                    <div
                      key={client.clientSessionId}
                      style={{
                        ...csCardNested(),
                        padding: '12px 16px',
                        fontSize: '13px',
                        lineHeight: 1.5,
                        borderLeft: `3px solid ${rail}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          marginBottom: '6px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: dotColor,
                              flexShrink: 0,
                            }}
                          />
                          <div
                            style={{
                              fontWeight: 700,
                              color: CS.onSurface,
                              fontFamily: CS.fontDisplay,
                              fontSize: '13px',
                            }}
                          >
                            {match.kind === 'participant'
                              ? match.participantTitle
                              : 'Client session'}
                          </div>
                        </div>
                        {client.alerts.length > 0 ? (
                          <span
                            style={{
                              ...csBadge(
                                hasRed
                                  ? 'critical'
                                  : hasYellow
                                    ? 'warning'
                                    : 'good'
                              ),
                              padding: '2px 8px',
                              fontSize: '10px',
                              flexShrink: 0,
                            }}
                          >
                            {client.alerts.length} alert
                            {client.alerts.length === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                      {client.gameId ? (
                        <div
                          style={{
                            color: CS.onSurfaceVariant,
                            fontSize: '12px',
                            marginBottom: '2px',
                          }}
                        >
                          Activity: {client.gameId}
                        </div>
                      ) : null}
                      {client.sessionStatus ? (
                        <div
                          style={{ color: CS.onSurfaceMuted, fontSize: '11px' }}
                        >
                          Session: {client.sessionStatus}
                        </div>
                      ) : null}
                      {client.connectivityState ? (
                        <div
                          style={{ color: CS.onSurfaceMuted, fontSize: '11px' }}
                        >
                          Connectivity: {client.connectivityState}
                        </div>
                      ) : null}
                      <div
                        style={{ color: CS.onSurfaceMuted, fontSize: '11px' }}
                      >
                        Last active:{' '}
                        {formatTimestamp(client.lastHeartbeatUnixMs)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                ...csSectionLabel(),
                marginTop: '18px',
                marginBottom: '6px',
                color: CS.secondary,
              }}
            >
              Alert Rail
            </div>
            <div
              style={{
                fontSize: '11px',
                color: CS.onSurfaceMuted,
                marginBottom: '10px',
                lineHeight: 1.4,
              }}
            >
              Selected session — same layout as MiMo Remote Therapy console.
            </div>
            {!selectedMimoSnapshot ? (
              <div
                style={{
                  fontSize: '12px',
                  color: CS.onSurfaceMuted,
                  lineHeight: 1.5,
                }}
              >
                Select a session tile in the console to correlate MiMo metadata
                with a participant.
              </div>
            ) : selectedMimoSnapshot.alerts.length === 0 ? (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: CS.radiusMd,
                  background: CS.successSoft,
                  border: `1px solid rgba(47, 125, 83, 0.2)`,
                  fontSize: '13px',
                  color: CS.onSurface,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  No active alerts
                </div>
                <div style={{ fontSize: '12px', color: CS.onSurfaceMuted }}>
                  This client is stable according to the latest metadata for the
                  selected session.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {selectedMimoSnapshot.alerts
                  .slice()
                  .sort((left, right) => right.timestamp - left.timestamp)
                  .map(alert => {
                    const severityTone =
                      alert.severity === 'red'
                        ? 'critical'
                        : alert.severity === 'yellow'
                          ? 'warning'
                          : 'good';
                    return (
                      <article
                        key={alert.alertId}
                        style={{
                          ...csCardNested(),
                          padding: '14px 16px',
                          border: `1px solid ${
                            alert.severity === 'red'
                              ? 'rgba(192, 68, 68, 0.35)'
                              : alert.severity === 'yellow'
                                ? 'rgba(183, 119, 24, 0.35)'
                                : 'rgba(47, 125, 83, 0.25)'
                          }`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                            marginBottom: '6px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              color: CS.onSurface,
                              fontFamily: CS.fontDisplay,
                            }}
                          >
                            {toTitleCaseMimo(alert.type)}
                          </div>
                          <span
                            style={{
                              ...csBadge(severityTone),
                              padding: '4px 10px',
                              fontSize: '10px',
                            }}
                          >
                            {toTitleCaseMimo(alert.severity)}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '13px',
                            lineHeight: 1.55,
                            color: CS.onSurfaceVariant,
                          }}
                        >
                          {alert.message}
                        </div>
                        <div
                          style={{
                            marginTop: '8px',
                            fontSize: '11px',
                            color: CS.onSurfaceMuted,
                            fontWeight: 600,
                          }}
                        >
                          Triggered{' '}
                          {formatRelativeTimeForMimoAlert(alert.timestamp)}
                        </div>
                      </article>
                    );
                  })}
              </div>
            )}
          </>
        ) : null}
      </div>
    );
  }, [
    activeCall,
    mimoClientList,
    selectedMimoSnapshot,
    isActivityMonitorCollapsed,
  ]);

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
                        ...csStatusDot(CS.onSurfaceMuted),
                        width: '8px',
                        height: '8px',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: CS.onSurfaceMuted,
                      }}
                    >
                      Ready
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
                        {SHOW_GROUP_MANAGEMENT_IN_SESSION_CONSOLE ? (
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
                        ) : null}
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
                  gridTemplateColumns: 'minmax(0, 1fr) 300px',
                  gridTemplateRows: '1fr',
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
                  {/* Call header — title + screen share + connection status in one row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flex: '1 1 200px',
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
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '10px',
                        flexShrink: 0,
                      }}
                    >
                      {(activeCall.callMode === CallModeValue.Group ||
                        activeCall.callMode === CallModeValue.Adhoc) &&
                      activeCall.joinState === GroupJoinState.Joined &&
                      canTogglePresenting ? (
                        <button
                          type="button"
                          disabled={
                            Boolean(remoteScreenSharingParticipant) &&
                            !activeCall.presentingSource
                          }
                          onClick={togglePresenting}
                          title={
                            activeCall.presentingSource
                              ? i18n('icu:calling__button--presenting-off')
                              : remoteScreenSharingParticipant
                                ? i18n(
                                    'icu:calling__button--presenting-disabled'
                                  )
                                : i18n('icu:calling__button--presenting-on')
                          }
                          style={{
                            ...csCallControlButton(
                              Boolean(activeCall.presentingSource)
                            ),
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            opacity:
                              remoteScreenSharingParticipant &&
                              !activeCall.presentingSource
                                ? 0.45
                                : 1,
                            cursor:
                              remoteScreenSharingParticipant &&
                              !activeCall.presentingSource
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          <Icon svg={ICONS.screen} size={15} />
                          {activeCall.presentingSource
                            ? i18n('icu:calling__presenting--stop')
                            : i18n('icu:calling__button--presenting-on')}
                        </button>
                      ) : null}
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
                  </div>

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
                      /* ---- Direct call: local preview only (no remote tile in this console) ---- */
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
                              {directConversation.title}
                              {activeCall.hasRemoteVideo
                                ? ' — remote video not shown in this console'
                                : ' — camera off'}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : spotlightedParticipant ? (
                      /* ---- Spotlight mode: large video + compact tile strip ---- */
                      <div style={csSpotlightContainer()}>
                        <div style={csSpotlightMain()}>
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
                              {spotlightedParticipant.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSpotlightedSessionId(null);
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
                        <div style={{ overflow: 'auto', minHeight: 0 }}>
                          <TherapistVideoTileGrid
                            compact
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
                  <div style={{ minWidth: 0 }}>{mimoMetadataPanel}</div>
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
                        {canTogglePresenting ? (
                          <button
                            type="button"
                            disabled={
                              Boolean(remoteScreenSharingParticipant) &&
                              !activeCall.presentingSource
                            }
                            onClick={togglePresenting}
                            style={{
                              border: 'none',
                              borderRadius: CS.radiusMd,
                              padding: '10px 14px',
                              fontSize: '12px',
                              fontWeight: 600,
                              fontFamily: CS.fontBody,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              width: '100%',
                              transition: `all ${CS.transitionFast}`,
                              background: activeCall.presentingSource
                                ? CS.secondarySoft
                                : CS.surfaceLow,
                              color: activeCall.presentingSource
                                ? CS.secondary
                                : CS.onSurfaceVariant,
                              opacity:
                                remoteScreenSharingParticipant &&
                                !activeCall.presentingSource
                                  ? 0.45
                                  : 1,
                              cursor:
                                remoteScreenSharingParticipant &&
                                !activeCall.presentingSource
                                  ? 'not-allowed'
                                  : 'pointer',
                            }}
                          >
                            <Icon svg={ICONS.screen} size={16} />
                            {activeCall.presentingSource
                              ? i18n('icu:calling__presenting--stop')
                              : i18n('icu:calling__button--presenting-on')}
                          </button>
                        ) : null}
                        {activeCall.hasLocalVideo ? (
                          <div style={csBannerWarning()}>
                            <Icon svg={ICONS.info} size={14} />
                            {`Your camera is visible${selectedSession ? ` to ${selectedSession.title}` : ' in this session'}`}
                          </div>
                        ) : null}
                        {activeCall.presentingSource ? (
                          <div style={csBannerInfo()}>
                            <Icon svg={ICONS.info} size={14} />
                            {i18n('icu:calling__presenting--info--unknown')}
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

                  {/* Remote support controls (client-owned consent + runtime) */}
                  <div style={{ ...csSectionLabel(), marginBottom: '10px' }}>
                    Remote Support
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: '6px',
                      marginBottom: '24px',
                    }}
                  >
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
                        Status
                      </div>
                      <div
                        style={{
                          color: CS.onSurface,
                          fontWeight: 650,
                          marginBottom: '8px',
                        }}
                      >
                        {remoteSupportState.status.replace('_', ' ')}
                      </div>
                      <div
                        style={{
                          color: CS.onSurfaceMuted,
                          marginBottom: '2px',
                        }}
                      >
                        Therapist:{' '}
                        {remoteSupportState.therapistSessionId ??
                          'No active request'}
                      </div>
                      <div style={{ color: CS.onSurfaceMuted }}>
                        Expires:{' '}
                        {formatExpiry(remoteSupportState.expiresAtUnixMs)}
                      </div>
                    </div>

                    {remoteSupportState.status === 'request_received' ? (
                      <>
                        <div style={csBannerWarning()}>
                          <Icon svg={ICONS.info} size={14} />
                          Therapist requested temporary remote access.
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void onApproveRemoteSupport();
                          }}
                          disabled={remoteSupportBusyAction !== null}
                          style={{
                            ...csSecondaryButton(),
                            width: '100%',
                            fontSize: '12px',
                            padding: '10px 14px',
                            background: CS.successSoft,
                            color: CS.success,
                            opacity: remoteSupportBusyAction !== null ? 0.6 : 1,
                            cursor:
                              remoteSupportBusyAction !== null
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          {remoteSupportBusyAction === 'approve'
                            ? 'Approving...'
                            : 'Approve Access'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void onDeclineRemoteSupport();
                          }}
                          disabled={remoteSupportBusyAction !== null}
                          style={{
                            ...csSecondaryButton(),
                            width: '100%',
                            fontSize: '12px',
                            padding: '10px 14px',
                            background: CS.criticalSoft,
                            color: CS.critical,
                            opacity: remoteSupportBusyAction !== null ? 0.6 : 1,
                            cursor:
                              remoteSupportBusyAction !== null
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          {remoteSupportBusyAction === 'decline'
                            ? 'Declining...'
                            : 'Decline Access'}
                        </button>
                      </>
                    ) : null}

                    {remoteSupportState.status === 'active' ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void copyRemoteSupportField(
                              'id',
                              remoteSupportState.rustDeskId
                            )
                          }
                          disabled={!remoteSupportState.rustDeskId}
                          style={{
                            ...csSecondaryButton(),
                            width: '100%',
                            fontSize: '12px',
                            padding: '10px 14px',
                            opacity: remoteSupportState.rustDeskId ? 1 : 0.6,
                            cursor: remoteSupportState.rustDeskId
                              ? 'pointer'
                              : 'not-allowed',
                          }}
                        >
                          {copiedRemoteField === 'id' ? 'Copied ID' : 'Copy ID'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void copyRemoteSupportField(
                              'password',
                              remoteSupportState.rustDeskPassword
                            )
                          }
                          disabled={!remoteSupportState.rustDeskPassword}
                          style={{
                            ...csSecondaryButton(),
                            width: '100%',
                            fontSize: '12px',
                            padding: '10px 14px',
                            opacity: remoteSupportState.rustDeskPassword
                              ? 1
                              : 0.6,
                            cursor: remoteSupportState.rustDeskPassword
                              ? 'pointer'
                              : 'not-allowed',
                          }}
                        >
                          {copiedRemoteField === 'password'
                            ? 'Copied Password'
                            : 'Copy Password'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setShowRemoteSupportPassword(value => !value)
                          }
                          style={{
                            ...csSecondaryButton(),
                            width: '100%',
                            fontSize: '12px',
                            padding: '10px 14px',
                          }}
                        >
                          {showRemoteSupportPassword
                            ? 'Hide Password'
                            : 'Reveal Password'}
                        </button>
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
                              marginBottom: '2px',
                            }}
                          >
                            ID:{' '}
                            {remoteSupportState.rustDeskId ?? 'Not available'}
                          </div>
                          <div style={{ color: CS.onSurfaceMuted }}>
                            Password:{' '}
                            {showRemoteSupportPassword
                              ? (remoteSupportState.rustDeskPassword ??
                                'Not available')
                              : maskSecret(remoteSupportState.rustDeskPassword)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void onEndRemoteSupport();
                          }}
                          disabled={remoteSupportBusyAction !== null}
                          style={{
                            ...csSecondaryButton(),
                            width: '100%',
                            fontSize: '12px',
                            padding: '10px 14px',
                            background: CS.criticalSoft,
                            color: CS.critical,
                            opacity: remoteSupportBusyAction !== null ? 0.6 : 1,
                            cursor:
                              remoteSupportBusyAction !== null
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          {remoteSupportBusyAction === 'end'
                            ? 'Ending...'
                            : 'End Remote Access'}
                        </button>
                      </>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        void onOpenRustDesk();
                      }}
                      style={{
                        ...csSecondaryButton(),
                        width: '100%',
                        fontSize: '12px',
                        padding: '10px 14px',
                      }}
                    >
                      Open RustDesk
                    </button>

                    {remoteSupportState.error ? (
                      <div style={csBannerWarning()}>
                        <Icon svg={ICONS.info} size={14} />
                        {remoteSupportState.error}
                      </div>
                    ) : null}
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
                    {callCues.length > 0 ? (
                      callCues.map(cue => (
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
                            {activeCall.callMode !== CallModeValue.Direct &&
                            onBreakoutToOneToOne &&
                            selectedInterventionConversation ? (
                              <button
                                type="button"
                                disabled={breakoutBusy}
                                onClick={() => {
                                  if (
                                    breakoutBusy ||
                                    !selectedInterventionConversation ||
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
                                  cursor: breakoutBusy
                                    ? 'not-allowed'
                                    : 'pointer',
                                }}
                              >
                                <Icon
                                  svg={ICONS.pulse}
                                  size={14}
                                  color={CS.primary}
                                />
                                {breakoutBusy
                                  ? 'Starting 1:1 session…'
                                  : `1:1 session with ${selectedInterventionTargetTitle}`}
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
            )}
          </section>
        </div>
      </ModalContainer>
      {addGroupMembersModalNode}
      {createNewGroupWizardNode}
      {activeCall?.showNeedsScreenRecordingPermissionsWarning ? (
        <NeedsScreenRecordingPermissionsModal
          i18n={i18n}
          openSystemPreferencesAction={openSystemPreferencesAction}
          toggleScreenRecordingPermissionsDialog={
            toggleScreenRecordingPermissionsDialog
          }
        />
      ) : null}
    </>
  );
}
