// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { CallMode } from '../../types/CallDisposition.std.ts';
import { shouldHangUpForBreakoutInvite } from '../../services/mimoMessageHandler.preload.ts';

describe('mimoMessageHandler', () => {
  describe('shouldHangUpForBreakoutInvite', () => {
    it('returns false when there is no active call state', () => {
      assert.isFalse(shouldHangUpForBreakoutInvite(undefined));
      assert.isFalse(shouldHangUpForBreakoutInvite(null));
    });

    it('returns false for non-active states', () => {
      assert.isFalse(
        shouldHangUpForBreakoutInvite({
          state: 'Waiting',
          callMode: CallMode.Group,
        })
      );
    });

    it('returns true for active group calls', () => {
      assert.isTrue(
        shouldHangUpForBreakoutInvite({
          state: 'Active',
          callMode: CallMode.Group,
        })
      );
    });

    it('returns true for active call-link (adhoc) calls', () => {
      assert.isTrue(
        shouldHangUpForBreakoutInvite({
          state: 'Active',
          callMode: CallMode.Adhoc,
        })
      );
    });

    it('returns false for active direct calls', () => {
      assert.isFalse(
        shouldHangUpForBreakoutInvite({
          state: 'Active',
          callMode: CallMode.Direct,
        })
      );
    });
  });
});

