// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  computeMimoAlertsForDirectCall,
  DIRECT_CALL_NO_REMOTE_MEDIA_THRESHOLD_MS,
  DIRECT_CALL_NO_REMOTE_VIDEO_THRESHOLD_MS,
} from '../../services/mimoDirectCallRules.preload.ts';

describe('mimoDirectCallRules', () => {
  it('clears video tracking when remote video is available', () => {
    const r = computeMimoAlertsForDirectCall({
      hasRemoteVideo: true,
      hasRemoteAudio: true,
      now: 100_000,
      videoAbsentSince: 50_000,
      audioAbsentSince: null,
    });
    assert.deepEqual(r.alerts, []);
    assert.strictEqual(r.nextVideoAbsentSince, null);
  });

  it('does not alert before threshold without video', () => {
    const start = 1_000;
    const r = computeMimoAlertsForDirectCall({
      hasRemoteVideo: false,
      hasRemoteAudio: true,
      now: start + DIRECT_CALL_NO_REMOTE_VIDEO_THRESHOLD_MS - 1,
      videoAbsentSince: start,
      audioAbsentSince: null,
    });
    assert.deepEqual(r.alerts, []);
    assert.strictEqual(r.nextVideoAbsentSince, start);
  });

  it('emits yellow alert after threshold without video', () => {
    const start = 10_000;
    const now = start + DIRECT_CALL_NO_REMOTE_VIDEO_THRESHOLD_MS + 1;
    const r = computeMimoAlertsForDirectCall({
      hasRemoteVideo: false,
      hasRemoteAudio: true,
      now,
      videoAbsentSince: start,
      audioAbsentSince: null,
    });
    assert.strictEqual(r.alerts.length, 1);
    assert.strictEqual(r.alerts[0]?.severity, 'yellow');
    assert.strictEqual(r.alerts[0]?.alertId, 'direct-no-remote-video');
    assert.strictEqual(r.nextVideoAbsentSince, start);
  });

  it('emits audio alert after threshold without audio', () => {
    const start = 5_000;
    const now = start + DIRECT_CALL_NO_REMOTE_MEDIA_THRESHOLD_MS + 1;
    const r = computeMimoAlertsForDirectCall({
      hasRemoteVideo: true,
      hasRemoteAudio: false,
      now,
      videoAbsentSince: null,
      audioAbsentSince: start,
    });
    assert.strictEqual(r.alerts.length, 1);
    assert.strictEqual(r.alerts[0]?.alertId, 'direct-no-remote-audio');
  });

  it('can emit both video and audio alerts', () => {
    const vStart = 1_000;
    const aStart = 2_000;
    const now =
      Math.max(vStart, aStart) + DIRECT_CALL_NO_REMOTE_MEDIA_THRESHOLD_MS + 1;
    const r = computeMimoAlertsForDirectCall({
      hasRemoteVideo: false,
      hasRemoteAudio: false,
      now,
      videoAbsentSince: vStart,
      audioAbsentSince: aStart,
    });
    assert.strictEqual(r.alerts.length, 2);
    const ids = r.alerts.map(a => a.alertId).sort();
    assert.deepEqual(ids, [
      'direct-no-remote-audio',
      'direct-no-remote-video',
    ]);
  });
});
