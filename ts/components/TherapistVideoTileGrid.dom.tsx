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
  csVideoTile,
  csVideoTileGrid,
} from './therapistConsoleClinicalSerenity.std.ts';

// Thumbnail resolution for bandwidth optimization
const THUMBNAIL_WIDTH = 160;
const THUMBNAIL_HEIGHT = 120;

// Spotlight resolution
const SPOTLIGHT_WIDTH = 1280;
const SPOTLIGHT_HEIGHT = 720;

// Reduced resolution when a tile is spotlighted (others shrink)
const REDUCED_WIDTH = 120;
const REDUCED_HEIGHT = 90;

const TILE_ASPECT_RATIO = 4 / 3;
const DEFAULT_COMPACT_TILE_WIDTH = 120;
const DEFAULT_TILE_WIDTH = 180;

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

  return (
    <div
      style={csVideoTile(isSelected, compact)}
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
  remoteParticipants,
  spotlightedSessionId,
}: {
  remoteParticipants: ReadonlyArray<GroupCallRemoteParticipantType>;
  spotlightedSessionId: string | null;
}): Array<GroupCallVideoRequest> {
  return remoteParticipants.map(participant => {
    if (!participant.hasRemoteVideo) {
      return nonRenderedRemoteParticipant(participant);
    }

    const participantId = String(participant.demuxId);
    if (participantId === spotlightedSessionId) {
      return {
        demuxId: participant.demuxId,
        width: SPOTLIGHT_WIDTH,
        height: SPOTLIGHT_HEIGHT,
      };
    }

    if (spotlightedSessionId) {
      return {
        demuxId: participant.demuxId,
        width: REDUCED_WIDTH,
        height: REDUCED_HEIGHT,
      };
    }

    return {
      demuxId: participant.demuxId,
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
    };
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
  remoteAudioLevels: Map<number, number>;
  remoteParticipants: ReadonlyArray<GroupCallRemoteParticipantType>;
  selectedSessionId: string | null;
  setGroupCallVideoRequest: (
    _: Array<GroupCallVideoRequest>,
    speakerHeight: number
  ) => void;
  spotlightedSessionId: string | null;
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
  remoteAudioLevels,
  remoteParticipants,
  selectedSessionId,
  setGroupCallVideoRequest,
  spotlightedSessionId,
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
      remoteParticipants,
      spotlightedSessionId,
    });
    const speakerHeight = spotlightedSessionId ? SPOTLIGHT_HEIGHT : 0;
    setGroupCallVideoRequest(requests, speakerHeight);
  }, [
    manageVideoRequests,
    remoteParticipants,
    setGroupCallVideoRequest,
    spotlightedSessionId,
  ]);

  const handleClick = useCallback(
    (demuxId: number) => onSelectSession(String(demuxId)),
    [onSelectSession]
  );

  const handleDoubleClick = useCallback(
    (demuxId: number) => onSpotlightSession(String(demuxId)),
    [onSpotlightSession]
  );

  const columnCount = useMemo(() => {
    if (visibleGridSize == null) {
      return getGridColumnCount({
        compact,
        containerHeight: 0,
        containerWidth: 0,
        participantCount: remoteParticipants.length,
      });
    }

    return getGridColumnCount({
      compact,
      containerHeight: visibleGridSize.height,
      containerWidth: visibleGridSize.width,
      participantCount: remoteParticipants.length,
    });
  }, [compact, remoteParticipants.length, visibleGridSize]);

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

  if (remoteParticipants.length === 0) {
    const emptyLabel = 'No participants connected yet';
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
    <div ref={gridRef} style={gridStyle}>
      {remoteParticipants.map(participant => (
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
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          participant={participant}
          remoteParticipantsCount={remoteParticipants.length}
          tileHeight={tileHeight}
          tileWidth={tileWidth}
        />
      ))}
    </div>
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
      : SPOTLIGHT_WIDTH;
  const height =
    visibleContainerSize != null
      ? Math.max(1, Math.round(visibleContainerSize.height))
      : SPOTLIGHT_HEIGHT;

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
