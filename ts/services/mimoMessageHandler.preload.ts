// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../logging/log.std.ts';
import type { MessageEventData } from '../textsecure/messageReceiverEvents.std.ts';
import {
  MIMO_PROTOCOL_VERSION,
  isMiMoMessage,
  parseMiMoEnvelope,
} from '../types/MiMoProtocol.std.ts';
import type { MiMoEnvelopeType } from '../types/MiMoProtocol.std.ts';
import { CallMode } from '../types/CallDisposition.std.ts';
import {
  onRemoteControlRequestReceived,
  onRemoteReleaseReceived,
  onRustDeskSessionEndedReceived,
} from './remoteSupportController.preload.ts';

const log = createLogger('mimoMessageHandler');

type ConfirmFn = () => void;

export function isMiMoMessageBody(body: string | undefined | null): boolean {
  return isMiMoMessage(body);
}

export function shouldHangUpForBreakoutInvite(
  activeCallState: unknown
): boolean {
  if (!activeCallState || typeof activeCallState !== 'object') {
    return false;
  }

  const { state, callMode } = activeCallState as {
    state?: string;
    callMode?: CallMode;
  };

  if (state !== 'Active') {
    return false;
  }

  return callMode === CallMode.Group || callMode === CallMode.Adhoc;
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

  void routeIncomingMiMoMessage(envelope, senderAci);
  confirm();
}

async function routeIncomingMiMoMessage(
  envelope: MiMoEnvelopeType,
  senderAci: string
): Promise<void> {
  const { message } = envelope;

  switch (message.kind) {
    case 'remote_control_request': {
      await onRemoteControlRequestReceived(senderAci);
      return;
    }

    case 'remote_release':
      await onRemoteReleaseReceived(senderAci);
      return;

    case 'rustdesk_session_ended':
      await onRustDeskSessionEndedReceived(senderAci);
      return;

    case 'breakout_direct_invite':
      log.info(`mimo: breakout_direct_invite from ${senderAci}`);
      if (
        shouldHangUpForBreakoutInvite(
          window.reduxStore?.getState()?.calling?.activeCallState
        )
      ) {
        log.info('mimo: hanging up active group/call-link call for breakout invite');
        window.reduxActions?.calling?.hangUpActiveCall?.(
          'mimo breakout direct invite'
        );
      }
      return;

    case 'therapist_prompt': {
      log.info(`mimo: therapist_prompt from ${senderAci}`);
      const notification = new Notification('Message from your therapist', {
        body: message.text,
        silent: false,
      });
      notification.onclick = () => {
        window.focus();
      };
      return;
    }

    default:
      return;
  }
}
