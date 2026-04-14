// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../logging/log.std.ts';
import type { MessageEventData } from '../textsecure/messageReceiverEvents.std.ts';
import type {
  MiMoAlertPayloadType,
  MiMoMetadataIngestPayloadType,
} from '../types/MiMoMetadata.std.ts';
import type { StateType } from '../state/reducer.preload.ts';
import {
  MIMO_PROTOCOL_VERSION,
  isMiMoMessage,
  parseMiMoEnvelope,
} from '../types/MiMoProtocol.std.ts';
import type { MiMoEnvelopeType } from '../types/MiMoProtocol.std.ts';

const log = createLogger('mimoMessageHandler');
const RUSTDESK_TTL_MS = 5 * 60 * 1000;
const rustDeskExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

type ConfirmFn = () => void;

export function isMiMoMessageBody(body: string | undefined | null): boolean {
  return isMiMoMessage(body);
}

export function forwardIncomingMiMoMessage(
  data: MessageEventData,
  confirm: ConfirmFn
): void {
  const envelope = parseMiMoEnvelope(data.message.body);
  if (!envelope) {
    log.warn('forwardIncomingMiMoMessage: failed to parse envelope');
    confirm();
    return;
  }

  if (envelope.version > MIMO_PROTOCOL_VERSION) {
    log.warn(
      `forwardIncomingMiMoMessage: unsupported version ${envelope.version}`
    );
    confirm();
    return;
  }

  const senderAci = data.sourceAci ?? envelope.senderAci ?? data.source;
  if (!senderAci) {
    log.warn(
      `forwardIncomingMiMoMessage: missing sender for ${envelope.message.kind}`
    );
    confirm();
    return;
  }

  if (
    data.sourceAci &&
    envelope.senderAci &&
    data.sourceAci !== envelope.senderAci
  ) {
    log.warn(
      `forwardIncomingMiMoMessage: sourceAci mismatch ${data.sourceAci} !== ${envelope.senderAci}`
    );
  }

  routeIncomingMiMoMessage(envelope, senderAci);
  confirm();
}

function dispatchMiMoMetadata(payload: MiMoMetadataIngestPayloadType): void {
  if (!payload.clientSessionId) {
    return;
  }

  if (window.reduxActions?.mimoSession?.ingestMetadata) {
    window.reduxActions.mimoSession.ingestMetadata(payload);
    return;
  }

  log.warn(
    `dispatchMiMoMetadata: redux not ready for ${payload.clientSessionId}`
  );
}

function clearRustDeskExpiryTimer(clientSessionId: string): void {
  const timer = rustDeskExpiryTimers.get(clientSessionId);
  if (timer) {
    clearTimeout(timer);
    rustDeskExpiryTimers.delete(clientSessionId);
  }
}

function scheduleRustDeskExpiry(clientSessionId: string, expiresAtUnixMs: number): void {
  clearRustDeskExpiryTimer(clientSessionId);
  const delayMs = Math.max(0, expiresAtUnixMs - Date.now());
  const timer = setTimeout(() => {
    if (window.reduxActions?.mimoSession?.expireRustDeskCredentials) {
      window.reduxActions.mimoSession.expireRustDeskCredentials({
        clientSessionId,
        atUnixMs: Date.now(),
      });
    }
    rustDeskExpiryTimers.delete(clientSessionId);
  }, delayMs);
  rustDeskExpiryTimers.set(clientSessionId, timer);
}

function routeIncomingMiMoMessage(
  envelope: MiMoEnvelopeType,
  senderAci: string
): void {
  const { message } = envelope;

  switch (message.kind) {
    case 'heartbeat':
      dispatchMiMoMetadata({
        ...message.payload,
        clientSessionId: message.payload.clientSessionId || senderAci,
      });
      return;

    case 'alert': {
      const incoming: MiMoAlertPayloadType = message.payload;
      const clientSessionId = senderAci;
      let mergedAlerts: ReadonlyArray<MiMoAlertPayloadType> = [incoming];
      const store = window.reduxStore;
      if (store) {
        const state = store.getState() as StateType;
        const prev = state.mimoSession.clients[clientSessionId]?.alerts;
        if (prev && prev.length > 0) {
          const byId = new Map(
            prev.map(a => [a.alertId, a] as const)
          );
          byId.set(incoming.alertId, incoming);
          mergedAlerts = Array.from(byId.values());
        }
      }
      dispatchMiMoMetadata({
        clientSessionId,
        heartbeatUnixMs: incoming.timestamp,
        alerts: mergedAlerts,
      });
      return;
    }

    case 'session_state':
      dispatchMiMoMetadata({
        clientSessionId: senderAci,
        heartbeatUnixMs: envelope.timestamp,
        sessionStatus: message.payload.sessionStatus,
        connectivityState: message.payload.connectivityState,
        currentModule: message.payload.currentModule,
        expectedActivityType: message.payload.expectedActivityType,
        activityProgress: message.payload.activityProgress,
        snapshotRef: message.payload.snapshotRef,
      });
      return;

    case 'remote_control_response':
      log.info(`mimo: remote control response approved=${message.approved}`);
      if (!message.approved && window.reduxActions?.mimoSession?.markRustDeskEnded) {
        window.reduxActions.mimoSession.markRustDeskEnded({
          clientSessionId: senderAci,
          atUnixMs: envelope.timestamp || Date.now(),
        });
      }
      return;

    case 'remote_release':
      log.info(`mimo: remote release from ${senderAci}`);
      clearRustDeskExpiryTimer(senderAci);
      if (window.reduxActions?.mimoSession?.markRustDeskEnded) {
        window.reduxActions.mimoSession.markRustDeskEnded({
          clientSessionId: senderAci,
          atUnixMs: envelope.timestamp || Date.now(),
        });
      }
      return;

    case 'rustdesk_credentials':
      log.info(`mimo: rustdesk credentials received from ${senderAci}`);
      if (window.reduxActions?.mimoSession?.ingestRustDeskCredentials) {
        const issuedAtUnixMs = envelope.timestamp || Date.now();
        window.reduxActions.mimoSession.ingestRustDeskCredentials({
          clientSessionId: senderAci,
          rustdeskId: message.rustdeskId,
          temporaryPassword: message.temporaryPassword,
          issuedAtUnixMs,
          ttlMs: RUSTDESK_TTL_MS,
        });
        scheduleRustDeskExpiry(senderAci, issuedAtUnixMs + RUSTDESK_TTL_MS);
      }
      return;

    case 'rustdesk_session_ended':
      log.info(`mimo: rustdesk session ended from ${senderAci}`);
      clearRustDeskExpiryTimer(senderAci);
      if (window.reduxActions?.mimoSession?.markRustDeskEnded) {
        window.reduxActions.mimoSession.markRustDeskEnded({
          clientSessionId: senderAci,
          atUnixMs: envelope.timestamp || Date.now(),
        });
      }
      return;

    case 'breakout_direct_invite':
      log.info(
        `mimo: breakout_direct_invite received from ${senderAci} (ignored on therapist)`
      );
      return;

    default:
      log.warn(
        `mimo: unknown message kind ${(message as { kind: string }).kind}`
      );
  }
}
