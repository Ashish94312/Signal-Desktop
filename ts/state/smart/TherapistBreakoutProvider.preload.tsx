// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { createLogger } from '../../logging/log.std.ts';
import * as Errors from '../../types/errors.std.ts';
import type { SavedMultiPartyContext } from '../../types/TherapistBreakout.std.ts';
import { CallMode } from '../../types/CallDisposition.std.ts';
import type { ServiceIdString } from '../../types/ServiceId.std.ts';
import { isGroupOrAdhocCallMode } from '../../util/isGroupOrAdhocCall.std.ts';
import { sleep } from '../../util/sleep.std.ts';
import { sendBreakoutDirectInvite } from '../../services/mimoMessageSender.preload.ts';
import { mapStateToActiveCallProp } from './mapStateToActiveCallProp.preload.tsx';
import { useCallingActions } from '../ducks/calling.preload.ts';
const log = createLogger('TherapistBreakoutProvider');
// Give the client enough time to disconnect its active group/call-link session
// before RingRTC delivers the direct 1:1 offer.
const BREAKOUT_DIRECT_INVITE_GRACE_MS = 3500;

type TherapistBreakoutContextValueType = Readonly<{
  savedMultiPartyContext: SavedMultiPartyContext | null;
  breakoutBusy: boolean;
  handleBreakoutToOneToOne: (
    directConversationId: string,
    recipientServiceId?: ServiceIdString
  ) => Promise<void>;
  handleRejoinSavedMultiParty: () => Promise<void>;
}>;

const TherapistBreakoutContext =
  createContext<TherapistBreakoutContextValueType | null>(null);

export const TherapistBreakoutProvider = memo(
  function TherapistBreakoutProvider({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element {
    const activeCall = useSelector(mapStateToActiveCallProp);
    const [savedMultiPartyContext, setSavedMultiPartyContext] =
      useState<SavedMultiPartyContext | null>(null);
    const [breakoutBusy, setBreakoutBusy] = useState(false);
    const [breakoutPhase, setBreakoutPhase] = useState<
      'idle' | 'transitioning' | 'inDirect'
    >('idle');

    const {
      hangUpThenStartCallLinkLobbyByRoomId,
      hangUpThenStartCallingLobby,
      startCallLinkLobbyByRoomId,
      startCallingLobby,
    } = useCallingActions();

    useEffect(() => {
      if (!activeCall || !savedMultiPartyContext) {
        return;
      }
      if (!isGroupOrAdhocCallMode(activeCall.callMode)) {
        return;
      }
      const savedId =
        savedMultiPartyContext.kind === 'conversation'
          ? savedMultiPartyContext.conversationId
          : savedMultiPartyContext.roomId;
      if (activeCall.conversation.id === savedId) {
        setSavedMultiPartyContext(null);
      }
    }, [activeCall, savedMultiPartyContext]);

    // Automatically rejoin the saved multi-party call when the 1:1 ends.
    useEffect(() => {
      if (!savedMultiPartyContext) {
        if (breakoutPhase !== 'idle') {
          setBreakoutPhase('idle');
        }
        return;
      }

      if (breakoutPhase === 'idle') {
        return;
      }

      if (breakoutPhase === 'transitioning') {
        if (activeCall?.callMode === CallMode.Direct) {
          setBreakoutPhase('inDirect');
        }
        return;
      }

      // breakoutPhase === 'inDirect'
      if (activeCall?.callMode === CallMode.Direct) {
        return;
      }
      if (activeCall && isGroupOrAdhocCallMode(activeCall.callMode)) {
        // Landed in a group/adhoc call without going through Direct — done
        setBreakoutPhase('idle');
        return;
      }

      // activeCall is null: the 1:1 just ended — auto-rejoin
      log.info(
        'TherapistBreakoutProvider: 1:1 ended, auto-rejoining multi-party session'
      );
      setBreakoutPhase('idle');
      void handleRejoinSavedMultiParty();
    }, [
      activeCall,
      breakoutPhase,
      handleRejoinSavedMultiParty,
      savedMultiPartyContext,
    ]);

    const handleBreakoutToOneToOne = useCallback(
      async (
        directConversationId: string,
        recipientServiceId?: ServiceIdString
      ) => {
        if (!activeCall || activeCall.callMode === CallMode.Direct) {
          return;
        }
        if (!isGroupOrAdhocCallMode(activeCall.callMode)) {
          return;
        }
        const title = activeCall.conversation.title;
        const saved: SavedMultiPartyContext =
          activeCall.callMode === CallMode.Group
            ? {
                kind: 'conversation',
                conversationId: activeCall.conversation.id,
                title,
              }
            : {
                kind: 'callLink',
                roomId: activeCall.conversation.id,
                title,
              };
        setSavedMultiPartyContext(saved);
        setBreakoutPhase('transitioning');
        setBreakoutBusy(true);
        try {
          if (recipientServiceId) {
            try {
              await sendBreakoutDirectInvite(recipientServiceId, title ?? null);
              await sleep(BREAKOUT_DIRECT_INVITE_GRACE_MS);
            } catch (error) {
              log.warn(
                'TherapistBreakoutProvider: breakout invite send failed',
                Errors.toLogFormat(error)
              );
            }
          }

          await hangUpThenStartCallingLobby({
            hangUpReason: 'therapist breakout to 1:1',
            nextConversationId: directConversationId,
            isVideoCall: true,
            autoPlaceOutgoingDirectCall: true,
          });
        } catch (error) {
          setSavedMultiPartyContext(null);
          setBreakoutPhase('idle');
          log.error(
            'TherapistBreakoutProvider: breakout to 1:1 failed',
            Errors.toLogFormat(error)
          );
        } finally {
          setBreakoutBusy(false);
        }
      },
      [activeCall, hangUpThenStartCallingLobby]
    );

    const handleRejoinSavedMultiParty = useCallback(async () => {
      if (!savedMultiPartyContext) {
        return;
      }
      setBreakoutBusy(true);
      try {
        if (activeCall) {
          if (savedMultiPartyContext.kind === 'conversation') {
            await hangUpThenStartCallingLobby({
              hangUpReason: 'therapist rejoin multi-party from 1:1',
              nextConversationId: savedMultiPartyContext.conversationId,
              isVideoCall: true,
              autoJoinAfterLobby: true,
            });
          } else {
            await hangUpThenStartCallLinkLobbyByRoomId({
              hangUpReason: 'therapist rejoin call link from 1:1',
              roomId: savedMultiPartyContext.roomId,
              autoJoinAfterLobby: true,
            });
          }
        } else if (savedMultiPartyContext.kind === 'conversation') {
          await startCallingLobby({
            conversationId: savedMultiPartyContext.conversationId,
            isVideoCall: true,
            autoJoinAfterLobby: true,
          });
        } else {
          await startCallLinkLobbyByRoomId({
            roomId: savedMultiPartyContext.roomId,
            autoJoinAfterLobby: true,
          });
        }
        setSavedMultiPartyContext(null);
      } catch (error) {
        log.error(
          'TherapistBreakoutProvider: rejoin multi-party failed',
          Errors.toLogFormat(error)
        );
      } finally {
        setBreakoutBusy(false);
      }
    }, [
      activeCall,
      hangUpThenStartCallLinkLobbyByRoomId,
      hangUpThenStartCallingLobby,
      savedMultiPartyContext,
      startCallLinkLobbyByRoomId,
      startCallingLobby,
    ]);

    const value = useMemo(
      (): TherapistBreakoutContextValueType => ({
        savedMultiPartyContext,
        breakoutBusy,
        handleBreakoutToOneToOne,
        handleRejoinSavedMultiParty,
      }),
      [
        savedMultiPartyContext,
        breakoutBusy,
        handleBreakoutToOneToOne,
        handleRejoinSavedMultiParty,
      ]
    );

    return (
      <TherapistBreakoutContext.Provider value={value}>
        {children}
      </TherapistBreakoutContext.Provider>
    );
  }
);

export function useTherapistBreakout(): TherapistBreakoutContextValueType {
  const ctx = useContext(TherapistBreakoutContext);
  if (!ctx) {
    throw new Error(
      'useTherapistBreakout must be used within TherapistBreakoutProvider'
    );
  }
  return ctx;
}

/** Safe when Provider is absent (e.g. tests); returns null if outside Provider. */
export function useTherapistBreakoutOptional(): TherapistBreakoutContextValueType | null {
  return useContext(TherapistBreakoutContext);
}
