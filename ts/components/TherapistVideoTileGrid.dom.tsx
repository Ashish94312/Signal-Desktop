// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { VideoFrameSource } from '@signalapp/ringrtc';
import type {
  GroupCallRemoteParticipantType,
  GroupCallVideoRequest,
} from '../types/Calling.std.ts';
import { useGetCallingFrameBuffer } from '../calling/useGetCallingFrameBuffer.std.ts';
import type { Size } from '../hooks/useSizeObserver.dom.tsx';
import { useSizeObserver } from '../hooks/useSizeObserver.dom.tsx';
import { GroupCallRemoteParticipant } from './GroupCallRemoteParticipant.dom.tsx';
import type { CallingImageDataCache } from './CallManager.dom.tsx';
import type { LocalizerType } from '../types/Util.std.ts';
import { nonRenderedRemoteParticipant } from '../util/ringrtc/nonRenderedRemoteParticipant.std.ts';
import {
  CS,
  TRIAGE_TILE_KEYFRAMES,
  csVideoTile,
  csVideoTileGrid,
  csVideoTileLabel,
  csVideoTileOverlay,
} from './therapistConsoleClinicalSerenity.std.ts';
import type { MiMoClientSnapshotType } from '../types/MiMoMetadata.std.ts';
import { getWorstMiMoAlertSeverity } from '../util/mimoAlertTriage.std.ts';
import { findMiMoSnapshotForGroupParticipant } from '../util/mimoSessionCorrelation.std.ts';

export type TherapistMonitoringQualityMode =
  | 'balanced'
  | 'low-fps'
  | 'thumbnail-only';

type StreamProfile = Readonly<{
  framerate?: number;
  height: number;
  width: number;
}>;

const STREAM_PROFILES: Record<
  TherapistMonitoringQualityMode,
  Readonly<{
    grid: StreamProfile;
    reduced: StreamProfile;
    spotlight: StreamProfile;
  }>
> = {
  balanced: {
    grid: { width: 160, height: 120 },
    reduced: { width: 120, height: 90 },
    spotlight: { width: 1280, height: 720 },
  },
  'low-fps': {
    grid: { width: 160, height: 120, framerate: 4 },
    reduced: { width: 120, height: 90, framerate: 3 },
    spotlight: { width: 960, height: 540, framerate: 10 },
  },
  'thumbnail-only': {
    grid: { width: 96, height: 72, framerate: 2 },
    reduced: { width: 96, height: 72, framerate: 2 },
    spotlight: { width: 640, height: 360, framerate: 6 },
  },
};
const DEFAULT_SPOTLIGHT_PROFILE = STREAM_PROFILES.balanced.spotlight;

const TILE_ASPECT_RATIO = 4 / 3;
const DEFAULT_COMPACT_TILE_WIDTH = 120;
const DEFAULT_TILE_WIDTH = 180;

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

type VisibleSize = Readonly<{ hidden: false; width: number; height: number }>;

function isVisibleSize(size: Size | null): size is VisibleSize {
  return size != null && size.hidden === false;
}

function getVisibleSize(size: Size | null): VisibleSize | null {
  return isVisibleSize(size) ? size : null;
}

function getGridColumnCount({
  compact,
  containerHeight,
  containerWidth,
  participantCount,
}: {
  compact: boolean;
  containerHeight: number;
  containerWidth: number;
  participantCount: number;
}): number {
  if (participantCount <= 1) {
    return 1;
  }

  const fallback = compact
    ? Math.min(participantCount, 2)
    : Math.max(1, Math.ceil(Math.sqrt(participantCount)));

  if (containerWidth <= 0 || containerHeight <= 0) {
    return fallback;
  }

  const gap = compact ? 6 : 10;
  const horizontalPadding = compact ? 16 : 0;
  const verticalPadding = compact ? 16 : 0;
  const maxColumns = compact ? Math.min(participantCount, 2) : participantCount;
  const availableWidth = Math.max(containerWidth - horizontalPadding, 1);
  const availableHeight = Math.max(containerHeight - verticalPadding, 1);

  let bestColumns = fallback;
  let bestArea = -Infinity;
  let bestOverflow = Infinity;

  for (let columns = 1; columns <= maxColumns; columns += 1) {
    const rows = Math.ceil(participantCount / columns);
    const tileWidth = (availableWidth - gap * (columns - 1)) / columns;
    if (tileWidth <= 0) {
      continue;
    }

    const tileHeight = tileWidth / TILE_ASPECT_RATIO;
    const totalHeight = tileHeight * rows + gap * (rows - 1);
    const overflow = Math.max(0, totalHeight - availableHeight);
    const area = tileWidth * tileHeight;

    if (overflow === 0) {
      if (bestOverflow > 0 || area > bestArea) {
        bestColumns = columns;
        bestArea = area;
        bestOverflow = 0;
      }
      continue;
    }

    if (
      bestOverflow > 0 &&
      (overflow < bestOverflow || (overflow === bestOverflow && area > bestArea))
    ) {
      bestColumns = columns;
      bestArea = area;
      bestOverflow = overflow;
    }
  }

  return bestColumns;
}

type TilePropsType = {
  audioLevel: number;
  compact: boolean;
  getFrameBuffer: () => Uint8Array<ArrayBuffer>;
  getGroupCallVideoFrameSource: (demuxId: number) => VideoFrameSource;
  i18n: LocalizerType;
  imageDataCache: React.RefObject<CallingImageDataCache | null>;
  isCallReconnecting: boolean;
  isSelected: boolean;
  joinedAt: number | null;
  mimoSnap?: MiMoClientSnapshotType | null;
  mimoWorst: 'red' | 'yellow' | 'green' | null;
  onClick: (demuxId: number) => void;
  onDoubleClick: (demuxId: number) => void;
  participant: GroupCallRemoteParticipantType;
  remoteParticipantsCount: number;
  tileHeight: number;
  tileWidth: number;
};

const VideoTile = React.memo(function VideoTileInner({
  audioLevel,
  compact,
  getFrameBuffer,
  getGroupCallVideoFrameSource,
  i18n,
  imageDataCache,
  isCallReconnecting,
  isSelected,
  joinedAt,
  mimoSnap,
  mimoWorst,
  onClick,
  onDoubleClick,
  participant,
  remoteParticipantsCount,
  tileHeight,
  tileWidth,
}: TilePropsType) {
  const handleClick = useCallback(
    () => onClick(participant.demuxId),
    [onClick, participant.demuxId]
  );
  const handleDoubleClick = useCallback(
    () => onDoubleClick(participant.demuxId),
    [onDoubleClick, participant.demuxId]
  );

  const connectivityColor =
    mimoSnap?.connectivityState === 'online'
      ? CS.success
      : mimoSnap?.connectivityState === 'reconnecting'
        ? CS.warning
        : mimoSnap?.connectivityState === 'offline'
          ? CS.critical
          : null;
  const gameLabel = mimoSnap?.gameId ?? mimoSnap?.currentModule ?? null;
  const showOverlay = connectivityColor !== null || gameLabel !== null;

  return (
    <div
      style={csVideoTile(isSelected, compact, mimoWorst)}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={`${participant.title} - double-click to spotlight`}
    >
      <GroupCallRemoteParticipant
        audioLevel={audioLevel}
        getFrameBuffer={getFrameBuffer}
        getGroupCallVideoFrameSource={getGroupCallVideoFrameSource}
        height={tileHeight}
        i18n={i18n}
        imageDataCache={imageDataCache}
        isActiveSpeakerInSpeakerView={false}
        isCallReconnecting={isCallReconnecting}
        joinedAt={joinedAt}
        remoteParticipant={participant}
        remoteParticipantsCount={remoteParticipantsCount}
        width={tileWidth}
      />
      {showOverlay && (
        <div style={csVideoTileOverlay()}>
          {connectivityColor !== null ? (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: connectivityColor,
                flexShrink: 0,
              }}
            />
          ) : (
            <span />
          )}
          {gameLabel !== null ? (
            <span style={csVideoTileLabel()}>{gameLabel}</span>
          ) : null}
        </div>
      )}
    </div>
  );
});

function getTileDimensions({
  columnCount,
  compact,
  gridSize,
}: {
  columnCount: number;
  compact: boolean;
  gridSize: ReturnType<typeof useSizeObserver>;
}): Readonly<{ tileHeight: number; tileWidth: number }> {
  const fallbackWidth = compact ? DEFAULT_COMPACT_TILE_WIDTH : DEFAULT_TILE_WIDTH;
  const visibleGridSize = getVisibleSize(gridSize);

  if (visibleGridSize == null) {
    return {
      tileHeight: Math.round(fallbackWidth / TILE_ASPECT_RATIO),
      tileWidth: fallbackWidth,
    };
  }

  const gap = compact ? 6 : 10;
  const horizontalPadding = compact ? 16 : 0;
  const availableWidth = Math.max(visibleGridSize.width - horizontalPadding, 1);
  const tileWidth = Math.max(
    1,
    Math.floor((availableWidth - gap * (columnCount - 1)) / columnCount)
  );

  return {
    tileHeight: Math.max(1, Math.round(tileWidth / TILE_ASPECT_RATIO)),
    tileWidth,
  };
}

function buildVideoRequests({
  monitoringQualityMode,
  remoteParticipants,
  spotlightedSessionId,
  focusModeSessionId,
}: {
  monitoringQualityMode: TherapistMonitoringQualityMode;
  remoteParticipants: ReadonlyArray<GroupCallRemoteParticipantType>;
  spotlightedSessionId: string | null;
  /** When set, only this participant receives decoded video (others: 0×0). */
  focusModeSessionId: string | null;
}): Array<GroupCallVideoRequest> {
  const streamProfile = STREAM_PROFILES[monitoringQualityMode];

  function buildRequest(
    demuxId: number,
    profile: StreamProfile
  ): GroupCallVideoRequest {
    return {
      demuxId,
      width: profile.width,
      height: profile.height,
      framerate: profile.framerate,
    };
  }

  return remoteParticipants.map(participant => {
    if (!participant.hasRemoteVideo) {
      return nonRenderedRemoteParticipant(participant);
    }

    const participantId = String(participant.demuxId);
    if (focusModeSessionId && participantId !== focusModeSessionId) {
      return nonRenderedRemoteParticipant(participant);
    }

    if (participantId === spotlightedSessionId) {
      return buildRequest(participant.demuxId, streamProfile.spotlight);
    }

    if (spotlightedSessionId) {
      return buildRequest(participant.demuxId, streamProfile.reduced);
    }

    return buildRequest(participant.demuxId, streamProfile.grid);
  });
}

type GridPropsType = {
  compact?: boolean;
  getGroupCallVideoFrameSource: (demuxId: number) => VideoFrameSource;
  i18n: LocalizerType;
  imageDataCache: React.RefObject<CallingImageDataCache | null>;
  isCallReconnecting: boolean;
  joinedAt: number | null;
  manageVideoRequests?: boolean;
  onSelectSession: (demuxId: string) => void;
  onSpotlightSession: (demuxId: string) => void;
  monitoringQualityMode?: TherapistMonitoringQualityMode;
  remoteAudioLevels: Map<number, number>;
  remoteParticipants: ReadonlyArray<GroupCallRemoteParticipantType>;
  selectedSessionId: string | null;
  setGroupCallVideoRequest: (
    _: Array<GroupCallVideoRequest>,
    speakerHeight: number
  ) => void;
  spotlightedSessionId: string | null;
  /** Focus mode: hide/decode video only for the focused participant. */
  focusModeSessionId?: string | null;
  /** MiMo snapshots keyed by `clientSessionId` (ACI / service id) for tile triage borders. */
  mimoClients?: Readonly<Record<string, MiMoClientSnapshotType>>;
};

export function TherapistVideoTileGrid({
  compact = false,
  getGroupCallVideoFrameSource,
  i18n,
  imageDataCache,
  isCallReconnecting,
  joinedAt,
  manageVideoRequests = true,
  onSelectSession,
  onSpotlightSession,
  monitoringQualityMode = 'balanced',
  remoteAudioLevels,
  remoteParticipants,
  selectedSessionId,
  setGroupCallVideoRequest,
  spotlightedSessionId,
  focusModeSessionId = null,
  mimoClients,
}: GridPropsType): React.JSX.Element {
  const getFrameBuffer = useGetCallingFrameBuffer();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const gridSize = useSizeObserver(gridRef);
  const visibleGridSize = getVisibleSize(gridSize);

  useEffect(() => {
    if (!manageVideoRequests) {
      return;
    }

    if (remoteParticipants.length === 0) {
      setGroupCallVideoRequest([], 0);
      return;
    }

    const requests = buildVideoRequests({
      monitoringQualityMode,
      remoteParticipants,
      spotlightedSessionId,
      focusModeSessionId,
    });
    const speakerHeight = spotlightedSessionId
      ? STREAM_PROFILES[monitoringQualityMode].spotlight.height
      : 0;
    setGroupCallVideoRequest(requests, speakerHeight);
  }, [
    monitoringQualityMode,
    manageVideoRequests,
    remoteParticipants,
    setGroupCallVideoRequest,
    spotlightedSessionId,
    focusModeSessionId,
  ]);

  const handleClick = useCallback(
    (demuxId: number) => onSelectSession(String(demuxId)),
    [onSelectSession]
  );

  const handleDoubleClick = useCallback(
    (demuxId: number) => onSpotlightSession(String(demuxId)),
    [onSpotlightSession]
  );

  const visibleParticipants = useMemo(() => {
    const baseParticipants =
      focusModeSessionId == null
        ? remoteParticipants
        : remoteParticipants.filter(
            participant => String(participant.demuxId) === focusModeSessionId
          );

    return baseParticipants
      .map((participant, index) => {
        const snap =
          mimoClients &&
          findMiMoSnapshotForGroupParticipant(mimoClients, participant);
        const mimoWorst = getWorstMiMoAlertSeverity(snap?.alerts) ?? null;
        const participantId = String(participant.demuxId);

        return {
          index,
          isSpotlighted: participantId === spotlightedSessionId,
          isSpeaking: (remoteAudioLevels.get(participant.demuxId) ?? 0) > 0,
          mimoRank: getMiMoSeverityRank(mimoWorst),
          participant,
        };
      })
      .sort((left, right) => {
        if (left.isSpotlighted !== right.isSpotlighted) {
          return Number(right.isSpotlighted) - Number(left.isSpotlighted);
        }

        if (left.mimoRank !== right.mimoRank) {
          return right.mimoRank - left.mimoRank;
        }

        if (left.isSpeaking !== right.isSpeaking) {
          return Number(right.isSpeaking) - Number(left.isSpeaking);
        }

        return left.index - right.index;
      })
      .map(item => item.participant);
  }, [
    focusModeSessionId,
    mimoClients,
    remoteAudioLevels,
    remoteParticipants,
    spotlightedSessionId,
  ]);

  const columnCount = useMemo(() => {
    if (visibleGridSize == null) {
      return getGridColumnCount({
        compact,
        containerHeight: 0,
        containerWidth: 0,
        participantCount: visibleParticipants.length,
      });
    }

    return getGridColumnCount({
      compact,
      containerHeight: visibleGridSize.height,
      containerWidth: visibleGridSize.width,
      participantCount: visibleParticipants.length,
    });
  }, [compact, visibleParticipants.length, visibleGridSize]);

  const { tileHeight, tileWidth } = useMemo(
    () =>
      getTileDimensions({
        columnCount,
        compact,
        gridSize,
      }),
    [columnCount, compact, gridSize]
  );

  const gridStyle = useMemo(
    () => ({
      ...csVideoTileGrid(compact),
      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
    }),
    [columnCount, compact]
  );

  if (visibleParticipants.length === 0) {
    const emptyLabel =
      focusModeSessionId != null && remoteParticipants.length > 0
        ? 'Focused participant is not in this call view.'
        : 'No participants connected yet';
    return (
      <div
        ref={gridRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          color: CS.onSurfaceMuted,
          fontSize: '14px',
          fontFamily: CS.fontBody,
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <>
      <style>{TRIAGE_TILE_KEYFRAMES}</style>
      <div ref={gridRef} style={gridStyle}>
      {visibleParticipants.map(participant => {
        const snap =
          mimoClients &&
          findMiMoSnapshotForGroupParticipant(mimoClients, participant);
        const mimoWorst = getWorstMiMoAlertSeverity(snap?.alerts) ?? null;
        return (
          <VideoTile
            key={participant.demuxId}
            audioLevel={remoteAudioLevels.get(participant.demuxId) ?? 0}
            compact={compact}
            getFrameBuffer={getFrameBuffer}
            getGroupCallVideoFrameSource={getGroupCallVideoFrameSource}
            i18n={i18n}
            imageDataCache={imageDataCache}
            isCallReconnecting={isCallReconnecting}
            isSelected={String(participant.demuxId) === selectedSessionId}
            joinedAt={joinedAt}
            mimoSnap={snap}
            mimoWorst={mimoWorst}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            participant={participant}
            remoteParticipantsCount={remoteParticipants.length}
            tileHeight={tileHeight}
            tileWidth={tileWidth}
          />
        );
      })}
    </div>
    </>
  );
}

type SpotlightPropsType = {
  audioLevel: number;
  getGroupCallVideoFrameSource: (demuxId: number) => VideoFrameSource;
  i18n: LocalizerType;
  imageDataCache: React.RefObject<CallingImageDataCache | null>;
  isCallReconnecting: boolean;
  joinedAt: number | null;
  participant: GroupCallRemoteParticipantType;
  remoteParticipantsCount: number;
};

export function TherapistSpotlightStage({
  audioLevel,
  getGroupCallVideoFrameSource,
  i18n,
  imageDataCache,
  isCallReconnecting,
  joinedAt,
  participant,
  remoteParticipantsCount,
}: SpotlightPropsType): React.JSX.Element {
  const getFrameBuffer = useGetCallingFrameBuffer();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerSize = useSizeObserver(containerRef);
  const visibleContainerSize = getVisibleSize(containerSize);
  const width =
    visibleContainerSize != null
      ? Math.max(1, Math.round(visibleContainerSize.width))
      : DEFAULT_SPOTLIGHT_PROFILE.width;
  const height =
    visibleContainerSize != null
      ? Math.max(1, Math.round(visibleContainerSize.height))
      : DEFAULT_SPOTLIGHT_PROFILE.height;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <GroupCallRemoteParticipant
        audioLevel={audioLevel}
        getFrameBuffer={getFrameBuffer}
        getGroupCallVideoFrameSource={getGroupCallVideoFrameSource}
        height={height}
        i18n={i18n}
        imageDataCache={imageDataCache}
        isActiveSpeakerInSpeakerView
        isCallReconnecting={isCallReconnecting}
        joinedAt={joinedAt}
        remoteParticipant={participant}
        remoteParticipantsCount={remoteParticipantsCount}
        width={width}
      />
    </div>
  );
}
