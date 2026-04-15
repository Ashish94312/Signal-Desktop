// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { GroupCallConnectionState } from '../../types/Calling.std.ts';
import { computeMimoAlertsForGroupCall } from '../../services/mimoGroupCallRules.preload.ts';

describe('mimoGroupCallRules', () => {
  it('warns on reconnecting', () => {
    const alerts = computeMimoAlertsForGroupCall({
      connectionState: GroupCallConnectionState.Reconnecting,
      remoteParticipantsCount: 3,
      now: 1,
    });
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0]?.alertId, 'group-reconnecting');
  });

  it('warns when connected but no remotes', () => {
    const alerts = computeMimoAlertsForGroupCall({
      connectionState: GroupCallConnectionState.Connected,
      remoteParticipantsCount: 0,
      now: 1,
    });
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0]?.alertId, 'group-no-remote-participants');
  });

  it('returns no alerts when connected with remotes', () => {
    const alerts = computeMimoAlertsForGroupCall({
      connectionState: GroupCallConnectionState.Connected,
      remoteParticipantsCount: 2,
      now: 1,
    });
    assert.deepEqual(alerts, []);
  });
});
