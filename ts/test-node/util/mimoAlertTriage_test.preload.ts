// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  getWorstMiMoAlertSeverity,
  miMoAlertsToConsoleCues,
} from '../../util/mimoAlertTriage.std.ts';

describe('mimoAlertTriage', () => {
  it('returns null for empty alerts', () => {
    assert.strictEqual(getWorstMiMoAlertSeverity([]), null);
    assert.strictEqual(getWorstMiMoAlertSeverity(undefined), null);
  });

  it('picks red over yellow and green', () => {
    assert.strictEqual(
      getWorstMiMoAlertSeverity([
        {
          alertId: 'a',
          type: 'inactivity',
          severity: 'green',
          message: 'ok',
          timestamp: 1,
        },
        {
          alertId: 'b',
          type: 'no_progress',
          severity: 'yellow',
          message: 'warn',
          timestamp: 2,
        },
        {
          alertId: 'c',
          type: 'disconnected',
          severity: 'red',
          message: 'bad',
          timestamp: 3,
        },
      ]),
      'red'
    );
  });

  it('maps alerts to console cue tones', () => {
    const cues = miMoAlertsToConsoleCues([
      {
        alertId: 'x',
        type: 'no_user',
        severity: 'red',
        message: 'No user',
        timestamp: 1,
      },
    ]);
    assert.strictEqual(cues.length, 1);
    assert.strictEqual(cues[0]?.tone, 'critical');
    assert.strictEqual(cues[0]?.label, 'MiMo · no_user');
  });
});
