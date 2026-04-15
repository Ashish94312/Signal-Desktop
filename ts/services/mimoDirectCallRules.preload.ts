// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { MiMoAlertPayloadType } from '../types/MiMoMetadata.std.ts';

/** Shared threshold for “remote video/audio absent too long” (direct calls). */
export const DIRECT_CALL_NO_REMOTE_MEDIA_THRESHOLD_MS = 45_000;

/** @deprecated alias — same as {@link DIRECT_CALL_NO_REMOTE_MEDIA_THRESHOLD_MS} */
export const DIRECT_CALL_NO_REMOTE_VIDEO_THRESHOLD_MS =
  DIRECT_CALL_NO_REMOTE_MEDIA_THRESHOLD_MS;

export type DirectCallRuleStateType = Readonly<{
  alerts: ReadonlyArray<MiMoAlertPayloadType>;
  nextVideoAbsentSince: number | null;
  nextAudioAbsentSince: number | null;
}>;

/**
 * Direct-call rules: prolonged lack of remote **video** and/or **audio** → yellow alerts.
 * When media returns, corresponding alert drops out of the array so therapist Redux clears via heartbeat.
 */
export function computeMimoAlertsForDirectCall(params: {
  hasRemoteVideo: boolean;
  hasRemoteAudio: boolean;
  now: number;
  videoAbsentSince: number | null;
  audioAbsentSince: number | null;
}): DirectCallRuleStateType {
  const {
    hasRemoteVideo,
    hasRemoteAudio,
    now,
    videoAbsentSince,
    audioAbsentSince,
  } = params;

  const alerts: Array<MiMoAlertPayloadType> = [];

  let nextVideoAbsentSince: number | null;
  if (hasRemoteVideo) {
    nextVideoAbsentSince = null;
  } else {
    const start = videoAbsentSince ?? now;
    nextVideoAbsentSince = start;
    if (now - start >= DIRECT_CALL_NO_REMOTE_MEDIA_THRESHOLD_MS) {
      alerts.push({
        alertId: 'direct-no-remote-video',
        type: 'inactivity',
        severity: 'yellow',
        message: 'Remote video unavailable for an extended period.',
        timestamp: now,
      });
    }
  }

  let nextAudioAbsentSince: number | null;
  if (hasRemoteAudio) {
    nextAudioAbsentSince = null;
  } else {
    const start = audioAbsentSince ?? now;
    nextAudioAbsentSince = start;
    if (now - start >= DIRECT_CALL_NO_REMOTE_MEDIA_THRESHOLD_MS) {
      alerts.push({
        alertId: 'direct-no-remote-audio',
        type: 'disconnected',
        severity: 'yellow',
        message: 'Remote audio unavailable for an extended period.',
        timestamp: now,
      });
    }
  }

  return {
    alerts,
    nextVideoAbsentSince,
    nextAudioAbsentSince,
  };
}
