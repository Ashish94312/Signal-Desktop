// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Signal MiMo metadata to the therapist:
 * - **Direct:** heartbeat to remote peer; rules — no remote video / audio past threshold → yellow
 *   alerts; heartbeats always include `alerts` (possibly `[]`) so therapist state clears when healthy.
 * - **Group / call-link:** heartbeat to `MIMO_THERAPIST_SERVICE_ID` (main process env, exposed via IPC);
 *   rules — reconnecting / zero remotes → yellow; same explicit `alerts` on every heartbeat.
 */

import React, { memo, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import { createLogger } from '../../logging/log.std.ts';
import { computeMimoAlertsForDirectCall } from '../../services/mimoDirectCallRules.preload.ts';
import { computeMimoAlertsForGroupCall } from '../../services/mimoGroupCallRules.preload.ts';
import {
  sendMiMoAlertToTherapist,
  sendMiMoHeartbeatToTherapist,
} from '../../services/mimoMessageSender.preload.ts';
import {
  CallState,
  GroupCallConnectionState,
  GroupCallJoinState,
} from '../../types/Calling.std.ts';
import { CallMode } from '../../types/CallDisposition.std.ts';
import type { ActiveCallType } from '../../types/Calling.std.ts';
import type { ServiceIdString } from '../../types/ServiceId.std.ts';
import { normalizeServiceId } from '../../types/ServiceId.std.ts';
import { drop } from '../../util/drop.std.ts';
import { mapStateToActiveCallProp } from './mapStateToActiveCallProp.preload.tsx';

const log = createLogger('MiMoTherapistMetadataProvider');

const HEARTBEAT_INTERVAL_MS = 20_000;

function getDirectCallMonitorKey(
  call: ActiveCallType | undefined
): string | null {
  if (
    !call ||
    call.callMode !== CallMode.Direct ||
    call.callState !== CallState.Accepted
  ) {
    return null;
  }
  const remote = call.remoteParticipants[0]?.serviceId;
  if (!remote) {
    return null;
  }
  return `direct:${call.conversation.id}:${remote}`;
}

function getGroupCallMonitorKey(
  call: ActiveCallType | undefined
): string | null {
  if (!call) {
    return null;
  }
  if (call.callMode !== CallMode.Group && call.callMode !== CallMode.Adhoc) {
    return null;
  }
  if (call.joinState !== GroupCallJoinState.Joined) {
    return null;
  }
  if (call.connectionState === GroupCallConnectionState.NotConnected) {
    return null;
  }
  return `group:${call.conversation.id}:${call.callMode}`;
}

export const MiMoTherapistMetadataProvider = memo(
  function MiMoTherapistMetadataProvider({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element {
    const activeCall = useSelector(mapStateToActiveCallProp);
    const activeCallRef = useRef(activeCall);
    activeCallRef.current = activeCall;

    const directMonitorKey = useMemo(
      () => getDirectCallMonitorKey(activeCall),
      [activeCall]
    );
    const groupMonitorKey = useMemo(
      () => getGroupCallMonitorKey(activeCall),
      [activeCall]
    );

    const videoAbsentSinceRef = useRef<number | null>(null);
    const audioAbsentSinceRef = useRef<number | null>(null);
    const directPreviousAlertIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
      if (window.SignalContext.isTestOrMockEnvironment()) {
        return;
      }

      if (directMonitorKey == null) {
        videoAbsentSinceRef.current = null;
        audioAbsentSinceRef.current = null;
        directPreviousAlertIdsRef.current = new Set();
        return;
      }

      const recipientServiceId =
        activeCallRef.current?.remoteParticipants[0]?.serviceId;
      if (!recipientServiceId) {
        return;
      }

      const send = () => {
        const call = activeCallRef.current;
        if (
          !call ||
          call.callMode !== CallMode.Direct ||
          call.callState !== CallState.Accepted
        ) {
          return;
        }
        const remote = call.remoteParticipants[0]?.serviceId;
        if (remote !== recipientServiceId) {
          return;
        }

        const now = Date.now();
        const { alerts, nextVideoAbsentSince, nextAudioAbsentSince } =
          computeMimoAlertsForDirectCall({
            hasRemoteVideo: call.hasRemoteVideo,
            hasRemoteAudio: call.hasRemoteAudio,
            now,
            videoAbsentSince: videoAbsentSinceRef.current,
            audioAbsentSince: audioAbsentSinceRef.current,
          });
        videoAbsentSinceRef.current = nextVideoAbsentSince;
        audioAbsentSinceRef.current = nextAudioAbsentSince;

        const prevIds = directPreviousAlertIdsRef.current;
        for (const a of alerts) {
          if (!prevIds.has(a.alertId)) {
            drop(
              sendMiMoAlertToTherapist(recipientServiceId, a).catch(err => {
                log.warn(
                  'MiMo alert send failed',
                  err instanceof Error ? err.message : String(err)
                );
              })
            );
          }
        }
        directPreviousAlertIdsRef.current = new Set(
          alerts.map(alert => alert.alertId)
        );

        drop(
          sendMiMoHeartbeatToTherapist(recipientServiceId, {
            sessionStatus: 'active',
            connectivityState: 'online',
            alerts,
          }).catch(err => {
            log.warn(
              'MiMo heartbeat send failed',
              err instanceof Error ? err.message : String(err)
            );
          })
        );
      };

      videoAbsentSinceRef.current = null;
      audioAbsentSinceRef.current = null;
      directPreviousAlertIdsRef.current = new Set();

      send();
      const id = setInterval(send, HEARTBEAT_INTERVAL_MS);
      return () => {
        clearInterval(id);
        videoAbsentSinceRef.current = null;
        audioAbsentSinceRef.current = null;
        directPreviousAlertIdsRef.current = new Set();
      };
    }, [directMonitorKey]);

    const groupPreviousAlertIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
      if (window.SignalContext.isTestOrMockEnvironment()) {
        return;
      }

      if (groupMonitorKey == null) {
        groupPreviousAlertIdsRef.current = new Set();
        return;
      }

      let canceled = false;
      let intervalId: ReturnType<typeof setInterval> | undefined;

      void (async () => {
        let therapistId: string | null = null;
        try {
          therapistId = await window.IPC.getMimoTherapistServiceId();
        } catch (err) {
          log.warn(
            'MiMo group: getMimoTherapistServiceId failed',
            err instanceof Error ? err.message : String(err)
          );
        }
        const normalizedTherapist = normalizeServiceId(
          therapistId ?? '',
          'MiMoTherapistMetadataProvider.group'
        );
        if (canceled || normalizedTherapist == null) {
          if (!canceled && groupMonitorKey != null) {
            log.info(
              'MiMo group: skipping metadata (set MIMO_THERAPIST_SERVICE_ID to therapist ACI / service id)'
            );
          }
          return;
        }

        const therapistServiceId: ServiceIdString = normalizedTherapist;

        const send = () => {
          const call = activeCallRef.current;
          if (!call) {
            return;
          }
          if (
            call.callMode !== CallMode.Group &&
            call.callMode !== CallMode.Adhoc
          ) {
            return;
          }
          if (call.joinState !== GroupCallJoinState.Joined) {
            return;
          }
          if (call.connectionState === GroupCallConnectionState.NotConnected) {
            return;
          }

          const now = Date.now();
          const alerts = computeMimoAlertsForGroupCall({
            connectionState: call.connectionState,
            remoteParticipantsCount: call.remoteParticipants.length,
            now,
          });

          const prevGroupIds = groupPreviousAlertIdsRef.current;
          for (const a of alerts) {
            if (!prevGroupIds.has(a.alertId)) {
              drop(
                sendMiMoAlertToTherapist(therapistServiceId, a).catch(err => {
                  log.warn(
                    'MiMo group alert send failed',
                    err instanceof Error ? err.message : String(err)
                  );
                })
              );
            }
          }
          groupPreviousAlertIdsRef.current = new Set(
            alerts.map(alert => alert.alertId)
          );

          drop(
            sendMiMoHeartbeatToTherapist(therapistServiceId, {
              sessionStatus: 'active',
              connectivityState:
                call.connectionState === GroupCallConnectionState.Reconnecting
                  ? 'reconnecting'
                  : 'online',
              alerts,
            }).catch(err => {
              log.warn(
                'MiMo group heartbeat send failed',
                err instanceof Error ? err.message : String(err)
              );
            })
          );
        };

        groupPreviousAlertIdsRef.current = new Set();
        send();
        intervalId = setInterval(send, HEARTBEAT_INTERVAL_MS);
      })();

      return () => {
        canceled = true;
        if (intervalId !== undefined) {
          clearInterval(intervalId);
        }
        groupPreviousAlertIdsRef.current = new Set();
      };
    }, [groupMonitorKey]);

    return <>{children}</>;
  }
);
