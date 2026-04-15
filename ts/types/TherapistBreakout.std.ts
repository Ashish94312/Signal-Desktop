// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * When the therapist leaves a GV2 group or call-link call for a direct 1:1 session,
 * we store enough context to rejoin the same multi-party room later.
 */
export type SavedMultiPartyContext =
  | Readonly<{
      kind: 'conversation';
      conversationId: string;
      title: string;
    }>
  | Readonly<{
      kind: 'callLink';
      roomId: string;
      title: string;
    }>;
